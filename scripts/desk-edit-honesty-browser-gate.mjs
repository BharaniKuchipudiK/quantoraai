#!/usr/bin/env node
/*
 * A FOLLOW-UP EDIT ANSWERED IN PROSE IS NOT DONE.
 *
 * 2026-09-06, the deployed golden's first second-turn transaction: a site was
 * built, then asked to change its heading. The model answered "I've updated
 * the main heading…" and returned no files. The desk, holding the site from
 * the turn before, proved THOSE files, found them fine, and closed the turn
 * as a success. The person read that the change was made; the site had not
 * changed. Self-healing never fired: no error was raised, only a claim.
 *
 * This gate drives that turn with a stubbed model: the first build lands,
 * the edit is answered in prose with no files, and the desk must NOT accept
 * it — it must take the one retry it has, with a brief that names what went
 * wrong, and the retry's files must render with the new heading. Broken on
 * purpose (the desk accepting the old files as proof), the second attempt
 * never happens and the heading never changes, and this gate says so.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const FIRST_HEADING = 'Calculator';
const NEW_HEADING = 'Golden Edit 42';
const RETRY_MARKER = 'PREVIOUS ATTEMPT FAILED VERIFICATION';

const project = (heading) => [
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
  '  return (',
  '    <main>',
  `      <h1 data-testid="page-heading">${heading}</h1>`,
  '      <output data-testid="calculator-display">{value}</output>',
  `      <button data-testid="calculator-one" onClick={() => setValue('1')}>1</button>`,
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
    `data: ${JSON.stringify({ provider: 'Synthetic', latencyMs: 8, modelId: 'synthetic-a', liveConnected: true, finish: 'complete', finishReason: 'STOP' })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const chatRequests = [];
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
      user: { sub: 'edit-honesty-user', name: 'Edit Honesty', email: 'edit@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
    ] }) });
  }
  // The planner is down on purpose: the deterministic rules must carry the follow-up as a build.
  if (path === '/api/plan-turn') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"planner offline"}' });
  // The real compiler, in process, so the preview renders without a deployment.
  if (path === '/api/preview-compile') {
    const body = request.postDataJSON?.() || {};
    try {
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.message || 'Preview compilation failed.' }) });
    }
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    if (body.task === 'verify-build') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        score: 100, passed: true, issues: [], checks: [{ id: 'styled', ok: true }],
      }) });
    }
    const message = String(body.message || '');
    const retry = message.includes(RETRY_MARKER);
    chatRequests.push({ message: message.slice(0, 600), retry, attempt: body.turnAttempt ?? null });
    let reply;
    if (chatRequests.length === 1) {
      reply = `Built the calculator.\n\n${project(FIRST_HEADING)}`;
    } else if (!retry) {
      // The defect's shape: a confident description of the change, and no files.
      reply = `I've updated the main heading at the top of the page to read ${NEW_HEADING}, and kept everything else exactly as it was. The calculator display and its button are untouched.`;
    } else {
      reply = `Here are the complete updated files with the new heading.\n\n${project(NEW_HEADING)}`;
    }
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(reply),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

const preview = () => page.locator('[data-quantora-real-project-preview="true"]').first();

/** The page heading as rendered in any frame but the desk's own, or null. */
async function renderedHeading() {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const text = await frame.locator('[data-testid="page-heading"]').first().innerText({ timeout: 500 }).catch(() => null);
    if (text) return text.trim();
  }
  return null;
}

async function waitForHeading(expected, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await renderedHeading()) === expected) return;
    if (await page.locator('[data-quantora-last-turn-failed="true"]').first().isVisible().catch(() => false)) {
      throw new Error(`${label}: the turn FAILED before the heading read "${expected}" (model turns: ${chatRequests.length}).`);
    }
    await page.waitForTimeout(250);
  }
  const prose = await page.locator('[data-quantora-assistant-prose]').allInnerTexts().catch(() => []);
  throw new Error(
    `${label}: no frame rendered the heading "${expected}" within ${Math.round(timeoutMs / 1000)}s `
    + `(rendered: ${JSON.stringify(await renderedHeading())}, model turns: ${chatRequests.length}, retries seen by the model: ${chatRequests.filter((entry) => entry.retry).length}, `
    + `preview=${(await preview().isVisible().catch(() => false)) ? 'mounted' : 'absent'}). `
    + `Last assistant text: ${JSON.stringify(String(prose.at(-1) || '').slice(0, 220))}`,
  );
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await enterSignedInStudio(page);
  const composer = page.locator('.app-shell--studio textarea').first();
  await composer.waitFor({ state: 'visible', timeout: 20_000 });

  // 1. A first build lands, as it always has.
  await composer.fill('Create a simple working React calculator. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes.');
  await composer.press('Enter');
  await waitForHeading(FIRST_HEADING, 45_000, 'First build');

  // 2. The follow-up is answered in prose with no files. The desk must not take the word for the deed.
  await composer.fill(`Change the main heading at the top of the page to read exactly: ${NEW_HEADING}. Keep everything else exactly as it is.`);
  await composer.press('Enter');
  await waitForHeading(NEW_HEADING, 60_000, 'Follow-up edit');

  const retries = chatRequests.filter((entry) => entry.retry);
  if (chatRequests.length !== 3 || retries.length !== 1) {
    throw new Error(`Expected three model turns (build, prose, retry with files) and one retry brief; saw ${chatRequests.length} turns and ${retries.length} retries: ${JSON.stringify(chatRequests)}`);
  }
  if (!/returned no files/.test(retries[0].message) && !/no runnable files|code fences/.test(retries[0].message)) {
    throw new Error(`The retry brief did not say what went wrong; it read: ${JSON.stringify(retries[0].message)}`);
  }
  // The prose attempt must never have been announced as done.
  const prose = await page.locator('[data-quantora-assistant-prose]').allInnerTexts().catch(() => []);
  const falseClaim = prose.find((text) => /Preview still needs to run them/.test(text) && !/Rebuilding|stricter/.test(text));
  if (falseClaim) throw new Error(`The desk closed the prose attempt as done: ${JSON.stringify(falseClaim.slice(0, 200))}`);

  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-edit-honesty.png`, fullPage: true }).catch(() => {});
  console.log(`Desk edit honesty gate passed — a fileless edit reply was retried once with a brief naming the fault, and the retry's files rendered "${NEW_HEADING}" (${chatRequests.length} model turns).`);
} catch (error) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-edit-honesty-failure.png`, fullPage: true }).catch(() => {});
  console.error(`Desk edit honesty gate FAILED: ${error?.stack || error}`);
  if (consoleErrors.length) console.error(`Console errors: ${JSON.stringify(consoleErrors.slice(0, 8))}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
