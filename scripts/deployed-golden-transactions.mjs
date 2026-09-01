#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { describePageState } from './lib/golden-page-state.mjs';

const BASE_URL = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
const CANARY_TOKEN = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
const VERCEL_BYPASS_TOKEN = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const TURN_TIMEOUT_MS = Number(process.env.QUANTORA_GOLDEN_TURN_TIMEOUT_MS || 150_000);
const BASE_ORIGIN = new URL(BASE_URL).origin;

if (!/^https:\/\//.test(BASE_URL)) throw new Error('QUANTORA_E2E_BASE_URL must be an HTTPS deployment URL.');
if (CANARY_TOKEN.length < 24) throw new Error('QUANTORA_GOLDEN_CANARY_TOKEN is missing or too short.');
if (VERCEL_BYPASS_TOKEN.length < 24) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is missing or too short.');

// Node's fetch does not persist Set-Cookie across redirects. Sending
// x-vercel-set-bypass-cookie here makes Vercel 307 forever (redirect count
// exceeded). Header-only bypass is enough for this readiness probe; the
// browser path below still sets the cookie for in-page navigations.
const apiBypassHeaders = {
  'X-Quantora-Golden-Canary': CANARY_TOKEN,
  'x-vercel-protection-bypass': VERCEL_BYPASS_TOKEN,
};
const browserBypassHeaders = {
  ...apiBypassHeaders,
  'x-vercel-set-bypass-cookie': 'samesitenone',
};

mkdirSync(ARTIFACT_DIR, { recursive: true });

const healthResponse = await fetch(`${BASE_URL}/api/inference-health`, { headers: apiBypassHeaders });
const health = await healthResponse.json().catch(() => ({}));
if (!healthResponse.ok || health.ready !== true) {
  throw new Error(`Deployed inference is not executable (${healthResponse.status}): ${JSON.stringify(health)}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
await context.route('**/*', (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== BASE_ORIGIN) return route.continue();
  return route.continue({
    headers: {
      ...request.headers(),
      ...browserBypassHeaders,
    },
  });
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
});

// The canary uses an isolated synthetic identity only to enter the Studio shell.
// /api/chat, provider routing, response parsing, /api/preview-compile and iframe
// rendering remain the real deployed services and are never intercepted.
await page.route('**/api/auth/session', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    user: {
      sub: 'quantora-golden-canary',
      name: 'Golden Canary',
      email: 'golden-canary@quantora.invalid',
      picture: null,
      isAdmin: false,
    },
  }),
}));

async function visible(locator, message, timeout = TURN_TIMEOUT_MS) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function frameWith(selector, timeout = TURN_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (await frame.locator(selector).first().isVisible().catch(() => false)) return frame;
    }
    const previewError = await page.locator('[data-quantora-real-project-preview="true"]').first().getAttribute('data-quantora-preview-error').catch(() => null);
    if (previewError) throw new Error(`The deployed iframe failed before ${selector} rendered: ${previewError}`);
    await page.waitForTimeout(250);
  }
  return null;
}

async function setGoldenTransaction(name) {
  await page.evaluate((transaction) => sessionStorage.setItem('quantora_golden_transaction', transaction), name);
}

async function correlationForPreview(previous = null) {
  const preview = page.locator('[data-quantora-real-project-preview="true"]').first();
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const contractError = await page.locator('[data-quantora-preview-contract-error]').first()
      .getAttribute('data-quantora-preview-contract-error').catch(() => null);
    if (contractError) throw new Error(contractError);
    /*
     * A turn that has already failed is not worth waiting out.
     *
     * The desk publishes data-quantora-last-turn-failed once the last AI
     * message is an error and nothing is still generating. Without it this
     * loop burned its full 150s on a turn that died in seconds, and reported
     * only that the artifact "never reached the preview" — the symptom of a
     * dozen different causes. Anchored on the hook, never on the failure copy,
     * which is free to change.
     */
    const turnFailed = await page.locator('[data-quantora-last-turn-failed="true"]').first()
      .isVisible().catch(() => false);
    if (turnFailed) {
      throw new Error(
        `The chat turn failed before any artifact was produced. `
        + `Page state: ${await describePageState(page, consoleErrors)}`,
      );
    }
    if (await preview.isVisible().catch(() => false)) {
      const correlationId = await preview.getAttribute('data-quantora-correlation-id');
      if (correlationId && correlationId !== previous) return correlationId;
    }
    await page.waitForTimeout(250);
  }
  /*
   * Say what the page was doing, not just that it did not finish. Without
   * this the only way to tell a failed chat turn from a slow one was to
   * download the run artifact, which is why this gate stayed mislabelled
   * as flaky instead of being diagnosed.
   */
  throw new Error(
    `The generated artifact never reached the deployed project preview after ${Math.round(TURN_TIMEOUT_MS / 1000)}s. `
    + `Page state at timeout: ${await describePageState(page, consoleErrors)}`,
  );
}

async function recordInteraction(correlationId, transaction) {
  const ok = await page.evaluate(async ({ correlationId: id, transaction: tx }) => {
    const response = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Quantora-Correlation-Id': id },
      body: JSON.stringify({ correlationId: id, transaction: tx, boundary: 'browser.interaction', state: 'interacted' }),
    });
    return response.ok;
  }, { correlationId, transaction });
  if (!ok) throw new Error(`Interaction proof could not be recorded for ${transaction}.`);
}

const evidence = {
  baseUrl: BASE_URL,
  deploymentSha: process.env.QUANTORA_DEPLOYMENT_SHA || null,
  startedAt: new Date().toISOString(),
  transactions: [],
};

function markActiveTransaction(name, correlationId = null) {
  evidence.activeTransaction = { name, correlationId };
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  /*
   * Anchor on the data hook, not the button's words.
   *
   * This used to be getByRole('button', { name: /^(AI )?Studio$/i }). The
   * landing CTA was later reworded to "Try Quantora", so the locator matched
   * nothing and this gate failed on EVERY run — which is what "historically
   * flaky" in the workflow actually meant. It was not flaky; it was stale and
   * permanently red, and being muted is why the ESM outage of 2026-08-31 went
   * unseen. data-quantora-enter-studio is the durable contract the landing
   * page already publishes for exactly this purpose, so copy changes can no
   * longer silence the deployment's most valuable test.
   */
  const studio = page.locator('[data-quantora-enter-studio="true"]').first();
  await visible(studio, 'The landing page never offered a way into the Studio (looked for [data-quantora-enter-studio]).', 20_000);
  await studio.click();

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing after the canary identity was restored.', 20_000);

  const calculatorStartedAt = Date.now();
  markActiveTransaction('calculator');
  await setGoldenTransaction('calculator');
  await prompt.fill('Create a simple working React calculator. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes. Import React and react-dom from their bare package names; do not return index.html or use any CDN. It must render an output with data-testid="calculator-display" initially showing 0 and a button with data-testid="calculator-one" that changes the display to 1 when clicked. Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package.');
  await prompt.press('Enter');
  const calculatorCorrelationId = await correlationForPreview();
  markActiveTransaction('calculator', calculatorCorrelationId);
  const calculatorFrame = await frameWith('[data-testid="calculator-display"]');
  if (!calculatorFrame) throw new Error(`Calculator artifact compiled, but its rendered DOM never appeared. Page state: ${await describePageState(page, consoleErrors)}`);
  const calculatorDisplay = calculatorFrame.locator('[data-testid="calculator-display"]').first();
  if ((await calculatorDisplay.innerText()).trim() !== '0') throw new Error('Calculator rendered with the wrong initial value.');
  await calculatorFrame.locator('[data-testid="calculator-one"]').first().click();
  await calculatorFrame.locator('[data-testid="calculator-display"]').first().waitFor({ state: 'visible', timeout: 10_000 });
  const calculatorValue = (await calculatorDisplay.innerText()).trim();
  if (calculatorValue !== '1') throw new Error(`Calculator interaction failed: expected 1, received ${calculatorValue}.`);
  await recordInteraction(calculatorCorrelationId, 'calculator');
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-calculator.png`, fullPage: true });
  evidence.transactions.push({
    name: 'calculator',
    correlationId: calculatorCorrelationId,
    rendered: true,
    interacted: true,
    durationMs: Date.now() - calculatorStartedAt,
  });
  delete evidence.activeTransaction;

  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChat, 'New Chat control is missing after the calculator transaction.', 15_000);
  await newChat.click();

  const websiteStartedAt = Date.now();
  markActiveTransaction('simple-website');
  await setGoldenTransaction('simple-website');
  await prompt.fill('Create a simple polished one-page React website for a neighborhood bakery. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes. Import React and react-dom from their bare package names; do not return index.html or use any CDN. The rendered page must contain an h1 with the exact text "Sunrise Bakery" and a visible button with data-testid="website-cta" labeled "View today’s menu". Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package, and do not use asset URLs, localStorage, sessionStorage, fetch, or undeclared variables.');
  await prompt.press('Enter');
  const websiteCorrelationId = await correlationForPreview(calculatorCorrelationId);
  markActiveTransaction('simple-website', websiteCorrelationId);
  const websiteFrame = await frameWith('h1');
  if (!websiteFrame) throw new Error(`Website artifact compiled, but its rendered DOM never appeared. Page state: ${await describePageState(page, consoleErrors)}`);
  const websiteHeading = await websiteFrame.locator('h1').first().innerText().catch(() => '');
  if (websiteHeading.trim() !== 'Sunrise Bakery') throw new Error(`Website rendered the wrong heading: ${websiteHeading}.`);
  const websiteCta = websiteFrame.locator('[data-testid="website-cta"]').first();
  await visible(websiteCta, 'Website CTA is missing from the rendered iframe.', 10_000);
  await websiteCta.click();
  await recordInteraction(websiteCorrelationId, 'simple-website');
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-website.png`, fullPage: true });
  evidence.transactions.push({
    name: 'simple-website',
    correlationId: websiteCorrelationId,
    rendered: true,
    interacted: true,
    durationMs: Date.now() - websiteStartedAt,
  });
  delete evidence.activeTransaction;

  evidence.completedAt = new Date().toISOString();
  evidence.consoleErrors = consoleErrors.slice(0, 20);
  writeFileSync(`${ARTIFACT_DIR}/deployed-golden-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...evidence }));
} catch (error) {
  evidence.failedAt = new Date().toISOString();
  evidence.error = error?.message || String(error);
  evidence.consoleErrors = consoleErrors.slice(0, 20);
  writeFileSync(`${ARTIFACT_DIR}/deployed-golden-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-failure.png`, fullPage: true }).catch(() => {});
  console.error('Deployed golden transactions FAILED:', error?.stack || error);
  // Whoever reads a failed run has the log; they may not have the artifact.
  console.error('Deployed golden evidence:', JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
