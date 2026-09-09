#!/usr/bin/env node
/**
 * TWO BUILDS IN ONE SESSION.
 *
 * The deployed golden runs two transactions back to back — a calculator, then
 * New Chat, then a website. Until 2026-09-04 the first one had never passed, so
 * the SECOND had never been reached: every local gate drives one build, and the
 * deployed gate died before it got there.
 *
 * Then the calculator passed and the website failed with
 *
 *   state: preview=absent buildJobs=0
 *
 * — no build job, no preview, and the turn not marked failed. A second build in
 * the same page session had simply never been covered anywhere.
 *
 * This drives exactly that shape against a synthetic model, so the class is
 * reproducible in seconds instead of a twelve-minute deploy. The model reply is
 * identical in both turns; only the session differs. If the second preview does
 * not mount, the defect is ours and not the model's.
 *
 * It also proves the Preview rail is a real return path, not merely a selected
 * button. A rendered second project is switched to Terminal and then back to
 * Preview; the same preview correlation and the same DOM marker must still be
 * running. That is the user-visible contract the rail smoke gate cannot prove
 * by checking `data-active` alone.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';

const project = (heading, testid, label) => [
  '```json filepath="package.json"',
  '{"name":"app","private":true,"dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}',
  '```',
  '',
  '```jsx filepath="src/main.jsx"',
  "import React from 'react';",
  "import { createRoot } from 'react-dom/client';",
  "import App from './App.jsx';",
  "import './styles.css';",
  "createRoot(document.getElementById('root')).render(<App />);",
  '```',
  '',
  '```jsx filepath="src/App.jsx"',
  "import React, { useState } from 'react';",
  'export default function App() {',
  "  const [value, setValue] = useState('0');",
  '  const press = (next) => setValue(next);',
  '  return (',
  '    <main>',
  `      <h1>${heading}</h1>`,
  '      <output data-testid="calculator-display">{value}</output>',
  `      <button data-testid="${testid}" onClick={() => press('1')}>${label}</button>`,
  '    </main>',
  '  );',
  '}',
  '```',
  '',
  '```css filepath="src/styles.css"',
  'body { margin: 0; font-family: system-ui }',
  '```',
].join('\n');

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic', latencyMs: 8, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

let chatTurns = 0;
/*
 * QUANTORA_E2E_CHROMIUM lets a sandbox point at a preinstalled Chromium whose
 * build differs from the pinned Playwright's. CI leaves it unset and uses the
 * cached browser, exactly like every other gate here.
 */
const executablePath = process.env.QUANTORA_E2E_CHROMIUM || undefined;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_active_specialist_domain');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user: { sub: 'second-turn-user', name: 'Second Turn', email: 'second@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    if (body.task === 'verify-build') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        score: 100, passed: true, issues: [], checks: [{ id: 'styled', ok: true }],
      }) });
    }
    chatTurns += 1;
    // Identical shape both turns. Only the session differs.
    const reply = chatTurns === 1
      ? `Built the calculator.\n\n${project('Calculator', 'calculator-one', '1')}`
      : `Here is the complete, self-contained Vite React project for Sunrise Bakery.\n\n${project('Sunrise Bakery', 'website-cta', 'View today’s menu')}`;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(reply),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

const preview = () => page.locator('[data-quantora-real-project-preview="true"]').first();

async function previewCorrelationId(previous, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await preview().isVisible().catch(() => false)) {
      const id = await preview().getAttribute('data-quantora-correlation-id').catch(() => null);
      if (id && id !== previous) return id;
    }
    await page.waitForTimeout(200);
  }
  const count = (selector) => page.locator(selector).count().catch(() => -1);
  const mounted = await preview().isVisible().catch(() => false);
  const previewError = await preview().getAttribute('data-quantora-preview-error').catch(() => null);
  const lastProse = await page.locator('[data-quantora-assistant-prose]').last().innerText({ timeout: 1500 }).catch(() => null);
  throw new Error(
    `${label}: no new project preview after ${Math.round(timeoutMs / 1000)}s `
    + `(preview=${mounted ? 'mounted' : 'absent'}`
    + ` modelTurns=${chatTurns}`
    + ` assistantMessages=${await count('[data-quantora-assistant-prose]')}`
    + ` buildJobs=${await count('[data-quantora-build-job]')}`
    + ` codeWorkspaces=${await count('[data-quantora-code-workspace]')}`
    + ` contractError=${await count('[data-quantora-preview-contract-error]')}`
    + ` lastTurnFailed=${await count('[data-quantora-last-turn-failed="true"]')}`
    + `${previewError ? ` previewError=${previewError}` : ''}). `
    + `lastProse=${JSON.stringify((lastProse || '').slice(0, 160))} `
    + `Console: ${consoleErrors.slice(-2).join(' | ') || 'none'}`,
  );
}

async function visibleFrame(selector, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (await frame.locator(selector).first().isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const { composer } = await enterSignedInStudio(page);

  await composer.fill('Create a simple working React calculator. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes.');
  await composer.press('Enter');
  const first = await previewCorrelationId(null, 'FIRST build');

  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await newChat.waitFor({ state: 'visible', timeout: 15_000 });
  await newChat.click();

  const composer2 = page.locator('.app-shell--studio textarea').first();
  await composer2.waitFor({ state: 'visible', timeout: 15_000 });
  await composer2.fill('Create a simple polished one-page React website for a neighborhood bakery. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes.');
  await composer2.press('Enter');

  /*
   * The whole point. A second build in the same page session must mount its own
   * preview with its own correlation id — not reuse the first one's, and not
   * silently produce no build at all.
   */
  const second = await previewCorrelationId(first, 'SECOND build (after New Chat)');
  if (second === first) throw new Error('The second build reused the first preview correlation id.');

  /*
   * PREVIEW IS A RETURN PATH, NOT A HIGHLIGHTED BUTTON.
   *
   * The rail smoke gate proves Preview becomes/stays active. That would still
   * pass if the click selected the tab while its iframe had lost the project's
   * VFS/run state. Prove the exact user journey instead: a known rendered page,
   * switch away, click Preview, then observe the same project again.
   */
  const renderedBeforeSwitch = await visibleFrame('[data-testid="website-cta"]', 20_000);
  if (!renderedBeforeSwitch) throw new Error('SECOND build mounted a Preview shell, but Sunrise Bakery never rendered inside it.');
  const markerBeforeSwitch = await renderedBeforeSwitch.locator('[data-testid="website-cta"]').first().innerText();
  if (!/today.?s menu/i.test(markerBeforeSwitch)) {
    throw new Error(`SECOND build rendered the wrong marker before the rail switch: ${JSON.stringify(markerBeforeSwitch)}`);
  }

  const terminalRail = page.locator('[data-quantora-desk-rail="terminal"]').first();
  await terminalRail.waitFor({ state: 'visible', timeout: 10_000 });
  await terminalRail.click();
  const terminal = page.locator('[data-quantora-studio-terminal="true"]').first();
  await terminal.waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await terminal.isVisible().catch(() => false))) throw new Error('Terminal rail did not switch away from the running Preview.');

  const previewRail = page.locator('[data-quantora-desk-rail="preview"]').first();
  await previewRail.waitFor({ state: 'visible', timeout: 10_000 });
  await previewRail.click();
  await preview().waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await preview().isVisible().catch(() => false))) throw new Error('Preview rail became clickable but did not restore the Preview pane.');

  const returnedCorrelation = await preview().getAttribute('data-quantora-correlation-id').catch(() => null);
  if (returnedCorrelation !== second) {
    throw new Error(`Preview rail restored the wrong run (${returnedCorrelation || 'none'} instead of ${second}).`);
  }
  const renderedAfterSwitch = await visibleFrame('[data-testid="website-cta"]', 20_000);
  if (!renderedAfterSwitch) throw new Error('Preview rail restored the pane, but the Sunrise Bakery iframe content was gone.');
  const markerAfterSwitch = await renderedAfterSwitch.locator('[data-testid="website-cta"]').first().innerText();
  if (markerAfterSwitch !== markerBeforeSwitch) {
    throw new Error(`Preview rail changed the rendered project (${JSON.stringify(markerBeforeSwitch)} -> ${JSON.stringify(markerAfterSwitch)}).`);
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/second-transaction.png', fullPage: true });
  console.log(`Second-transaction gate passed — two builds mounted distinct previews (${first} -> ${second}); Preview survived Terminal -> Preview with the same correlation and rendered marker; ${chatTurns} model turns.`);
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/second-transaction-failure.png', fullPage: true }).catch(() => {});
  console.error('Second-transaction gate FAILED:', error?.message || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}