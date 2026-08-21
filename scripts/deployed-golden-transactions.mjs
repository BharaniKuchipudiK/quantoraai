#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
const CANARY_TOKEN = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
const VERCEL_BYPASS_TOKEN = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const TURN_TIMEOUT_MS = Number(process.env.QUANTORA_GOLDEN_TURN_TIMEOUT_MS || 150_000);

if (!/^https:\/\//.test(BASE_URL)) throw new Error('QUANTORA_E2E_BASE_URL must be an HTTPS deployment URL.');
if (CANARY_TOKEN.length < 24) throw new Error('QUANTORA_GOLDEN_CANARY_TOKEN is missing or too short.');
if (VERCEL_BYPASS_TOKEN.length < 24) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is missing or too short.');

mkdirSync(ARTIFACT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  extraHTTPHeaders: {
    'X-Quantora-Golden-Canary': CANARY_TOKEN,
    'x-vercel-protection-bypass': VERCEL_BYPASS_TOKEN,
    'x-vercel-set-bypass-cookie': 'samesitenone',
  },
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
  await visible(preview, 'The generated artifact never reached the deployed project preview.');
  await page.waitForFunction((oldValue) => {
    const value = document.querySelector('[data-quantora-real-project-preview="true"]')?.getAttribute('data-quantora-correlation-id');
    return Boolean(value && value !== oldValue);
  }, previous, { timeout: TURN_TIMEOUT_MS });
  const correlationId = await preview.getAttribute('data-quantora-correlation-id');
  if (!correlationId) throw new Error('The preview rendered without an end-to-end correlation ID.');
  return correlationId;
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

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const studio = page.getByRole('button', { name: /^(AI )?Studio$/i }).first();
  await visible(studio, 'Studio navigation is missing from the deployed application.', 20_000);
  await studio.click();

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing after the canary identity was restored.', 20_000);

  const calculatorStartedAt = Date.now();
  await setGoldenTransaction('calculator');
  await prompt.fill('Create a simple working React calculator. Return complete runnable project files in fenced code blocks with filepath attributes. It must render an output with data-testid="calculator-display" initially showing 0 and a button with data-testid="calculator-one" that changes the display to 1 when clicked. Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package.');
  await prompt.press('Enter');
  const calculatorCorrelationId = await correlationForPreview();
  const calculatorFrame = await frameWith('[data-testid="calculator-display"]');
  if (!calculatorFrame) throw new Error('Calculator artifact compiled, but its rendered DOM never appeared.');
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

  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChat, 'New Chat control is missing after the calculator transaction.', 15_000);
  await newChat.click();

  const websiteStartedAt = Date.now();
  await setGoldenTransaction('simple-website');
  await prompt.fill('Create a simple polished one-page React website for a neighborhood bakery. Return complete runnable project files in fenced code blocks with filepath attributes. The rendered page must contain an h1 with the exact text "Sunrise Bakery" and a visible button with data-testid="website-cta" labeled "View today’s menu". Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package, and do not use asset URLs, localStorage, sessionStorage, fetch, or undeclared variables.');
  await prompt.press('Enter');
  const websiteCorrelationId = await correlationForPreview(calculatorCorrelationId);
  const websiteFrame = await frameWith('h1');
  if (!websiteFrame) throw new Error('Website artifact compiled, but its rendered DOM never appeared.');
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
  process.exitCode = 1;
} finally {
  await browser.close();
}
