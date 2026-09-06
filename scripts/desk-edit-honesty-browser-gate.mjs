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
// Distinct from the first scenario's headings: a frame left over from scenario A must not satisfy scenario B.
const HTML_FIRST_HEADING = 'Ramakrishna Venuzia Owners Welfare Association';
const HTML_NEW_HEADING = 'Golden Harvest Community Portal 7';
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

/** A single-file site — the shape the deployed brief-with-documents build took on 2026-09-06. */
const htmlSite = (heading) => [
  '```html',
  '<!doctype html>',
  '<html><head><meta charset="utf-8"><title>Association</title><style>body{font-family:system-ui;margin:0;padding:24px}</style></head>',
  '<body>',
  `  <h1 data-testid="page-heading">${heading}</h1>`,
  '  <p data-testid="reg-no">Registration number RKV-000000-GLD</p>',
  '  <section><h2>Events</h2><ul><li>Golden Harvest Fair</li></ul></section>',
  '</body></html>',
  '```',
].join('\n');

// Which scenario the stub is serving: 'vfs' (files) or 'html' (a single-file site).
let scenario = 'vfs';

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic', latencyMs: 8, modelId: 'synthetic-a', liveConnected: true, finish: 'complete', finishReason: 'STOP' })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const chatRequests = [];
const plannerRequests = [];
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
  // Scenario A: the planner is down, so the deterministic rules must carry the
  // follow-up as a build. Scenario B: the planner is UP and WRONG — it calls
  // the follow-up "chat" with high confidence — and the desk that shows a site
  // must not take its word (the second invariant: a build the desk owns is
  // never vetoed). The 2026-09-06 second run was exactly this shape.
  if (path === '/api/plan-turn') {
    if (scenario === 'vfs') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"planner offline"}' });
    const body = request.postDataJSON?.() || {};
    plannerRequests.push({ buildOwned: body.buildOwned === true, hasDeskFiles: body.hasDeskFiles === true, message: String(body.message || '').slice(0, 80) });
    const plan = { lane: 'chat', desk: null, officeKind: null, buildMode: false, confidence: 0.95, reason: 'reads as a question', source: 'planner', agreed: false };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan, deterministic: plan, model: plan }) });
  }
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
    chatRequests.push({ message: message.slice(0, 600), retry, attempt: body.turnAttempt ?? null, scenario, hasVFS: body.hasVFS, buildMode: body.buildMode });
    const turnInScenario = chatRequests.filter((entry) => entry.scenario === scenario).length;
    chatRequests[chatRequests.length - 1].scenario = scenario;
    let reply;
    if (turnInScenario === 1) {
      reply = scenario === 'vfs'
        ? `Built the calculator.\n\n${project(FIRST_HEADING)}`
        : `Here is the association site.\n\n${htmlSite(HTML_FIRST_HEADING)}`;
    } else if (!retry) {
      // The defect's shape: a confident description of the change, and no files.
      const asked = scenario === 'vfs' ? NEW_HEADING : HTML_NEW_HEADING;
      reply = `I've updated the main heading at the top of the page to read ${asked}, and kept everything else exactly as it was. Everything else on the page is untouched.`;
    } else {
      reply = scenario === 'vfs'
        ? `Here are the complete updated files with the new heading.\n\n${project(NEW_HEADING)}`
        : `Here is the complete updated page with the new heading.\n\n${htmlSite(HTML_NEW_HEADING)}`;
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

/**
 * Every page heading rendered in any frame but the desk's own. All of them,
 * because the desk may keep an earlier preview's frame in the DOM beside the
 * new one; the first frame found is not the newest.
 */
async function renderedHeadings() {
  const seen = [];
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const text = await frame.locator('[data-testid="page-heading"]').first().innerText({ timeout: 500 }).catch(() => null);
    if (text) seen.push(text.trim());
  }
  return seen;
}

async function waitForHeading(expected, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await renderedHeadings()).includes(expected)) return;
    if (await page.locator('[data-quantora-last-turn-failed="true"]').first().isVisible().catch(() => false)) {
      throw new Error(`${label}: the turn FAILED before the heading read "${expected}" (model turns: ${chatRequests.length}).`);
    }
    await page.waitForTimeout(250);
  }
  const prose = await page.locator('[data-quantora-assistant-prose]').allInnerTexts().catch(() => []);
  const frames = page.frames().filter((frame) => frame !== page.mainFrame()).map((frame) => `${frame.name() || '(unnamed)'}:${frame.url().slice(0, 60)}`);
  const workspaceText = await page.locator('[data-quantora-code-workspace="true"]').first().innerText({ timeout: 1000 }).catch(() => null);
  const patchNote = await page.locator('[data-quantora-patch-note]').first().innerText({ timeout: 500 }).catch(() => null);
  const lastBodies = chatRequests.slice(-2).map((entry) => ({ retry: entry.retry, attempt: entry.attempt, hasVFS: entry.hasVFS, buildMode: entry.buildMode }));
  throw new Error(
    `${label}: no frame rendered the heading "${expected}" within ${Math.round(timeoutMs / 1000)}s `
    + `[frames=${JSON.stringify(frames)} workspace=${JSON.stringify(String(workspaceText || '').slice(0, 200))} patchNote=${JSON.stringify(patchNote)} lastChatBodies=${JSON.stringify(lastBodies)}] `
    + `(rendered: ${JSON.stringify(await renderedHeadings())}, model turns: ${chatRequests.length}, retries seen by the model: ${chatRequests.filter((entry) => entry.retry).length}, `
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

  const judge = (label) => async () => {
    const turns = chatRequests.filter((entry) => entry.scenario === scenario);
    const retries = turns.filter((entry) => entry.retry);
    if (turns.length !== 3 || retries.length !== 1) {
      throw new Error(`${label}: expected three model turns (build, prose, retry with files) and one retry brief; saw ${turns.length} turns and ${retries.length} retries: ${JSON.stringify(turns)}`);
    }
    if (!/returned no files/.test(retries[0].message) && !/no runnable files|code fences/.test(retries[0].message)) {
      throw new Error(`${label}: the retry brief did not say what went wrong; it read: ${JSON.stringify(retries[0].message)}`);
    }
    // The prose attempt must never have been announced as done.
    const prose = await page.locator('[data-quantora-assistant-prose]').allInnerTexts().catch(() => []);
    const falseClaim = prose.find((text) => /Preview still needs to run them/.test(text) && !/Rebuilding|stricter/.test(text));
    if (falseClaim) throw new Error(`${label}: the desk closed the prose attempt as done: ${JSON.stringify(falseClaim.slice(0, 200))}`);
  };
  await judge('Scenario A (files, planner down)')();

  // 3. Scenario B: a single-file site, and a planner that calls the follow-up "chat".
  scenario = 'html';
  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await newChat.waitFor({ state: 'visible', timeout: 15_000 });
  await newChat.click();
  await composer.fill('Build a one-page website for the association described in the attached bylaws, with the registration number and an events section.');
  await composer.press('Enter');
  await waitForHeading(HTML_FIRST_HEADING, 45_000, 'Scenario B first build');

  await composer.fill(`Change the main heading at the top of the page to read exactly: ${HTML_NEW_HEADING}. Keep everything else exactly as it is.`);
  await composer.press('Enter');
  await waitForHeading(HTML_NEW_HEADING, 60_000, 'Scenario B follow-up edit');
  await judge('Scenario B (a single-file site, planner says chat)')();
  const followUpAsk = plannerRequests.find((entry) => /Change the main heading/.test(entry.message));
  if (!followUpAsk || followUpAsk.buildOwned !== true) {
    throw new Error(`The planner was not told the desk owns a build on the follow-up (${JSON.stringify(followUpAsk || plannerRequests)}) — the server cannot hold the invariant without it.`);
  }

  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-edit-honesty.png`, fullPage: true }).catch(() => {});
  console.log(`Desk edit honesty gate passed — a fileless edit reply was retried once with a brief naming the fault, on a file project with the planner down and on a single-file site with the planner calling it chat; both retries rendered their new heading (${chatRequests.length} model turns).`);
} catch (error) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-edit-honesty-failure.png`, fullPage: true }).catch(() => {});
  console.error(`Desk edit honesty gate FAILED: ${error?.stack || error}`);
  if (consoleErrors.length) console.error(`Console errors: ${JSON.stringify(consoleErrors.slice(0, 8))}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
