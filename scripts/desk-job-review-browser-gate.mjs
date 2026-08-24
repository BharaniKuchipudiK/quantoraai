#!/usr/bin/env node
/**
 * Review criteria used to exist only for two verticals.
 *
 * `probeRunningDesk` emitted checks when the desk looked like a shop or a
 * calculator and nothing otherwise, so a to-do list, a dashboard or a landing
 * page ran with an empty Preview-checks panel and no derived beat — the desk
 * had no opinion about its own job and direction fell back to chat text.
 *
 * This gate builds a to-do list that matches neither vertical heuristic and
 * walks its one probed criterion through all three honest states: unverified
 * while the running page was never asked, failing while the add button is
 * dead, passing once it works. The guardrail line the page cannot answer must
 * stay unverified the whole way through, and the beat must always read as the
 * running Preview rather than the sentence chat wrote.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';

// Chat says the opposite of the truth on purpose: the beat must not echo it.
const CHAT_CLAIM = 'Your to-do list is ready and items can be added.';

const todoApp = ({ working, footer }) => `import React, { useState } from 'react';

export default function App() {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState(['Ship the review gate']);
  function add() {
${working
    ? "    if (!draft.trim()) return;\n    setItems(items.concat([draft]));\n    setDraft('');"
    : '    // The add control is wired to nothing yet.'}
  }
  return (
    <main>
      <h1>My day</h1>
      <input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What needs doing?" />
      <button onClick={add}>Add</button>
      <ul>
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
${footer ? '      <footer>Quantora desk</footer>' : ''}
    </main>
  );
}
`;

function projectReply(app) {
  return [
    CHAT_CLAIM,
    '',
    '```json filepath="package.json"',
    JSON.stringify({
      name: 'desk-todo-review', private: true, version: '1.0.0', type: 'module',
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
      devDependencies: { '@vitejs/plugin-react': '^4.2.1', vite: '^5.1.4' },
    }),
    '```',
    '',
    '```html filepath="index.html"',
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
    '```',
    '',
    '```jsx filepath="src/main.jsx"',
    "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);",
    '```',
    '',
    '```jsx filepath="src/App.jsx"',
    app,
    '```',
    '',
    '```css filepath="src/index.css"',
    'body{margin:0;font-family:system-ui;background:#0f172a;color:#f8fafc}main{padding:32px}li{margin:4px 0}',
    '```',
  ].join('\n');
}

function driveCleanerReply() {
  const html = `<!DOCTYPE html><html><head><title>Drive Cleaner Agent</title></head><body>
<main>
  <h1>Drive Cleaner</h1>
  <p>Scan and remove duplicate files from Google Drive.</p>
  <button type="button">Scan Drive</button>
  <ul class="file-list"><li>Report Q3.pdf</li><li>Vacation.jpg</li></ul>
</main>
</body></html>`;
  return [
    'Here is a Drive Cleaner Agent dashboard.',
    '',
    '```html filepath="index.html"',
    html,
    '```',
  ].join('\n');
}

function patchReply(app) {
  return ['Updated the list.', '', '```jsx filepath="src/App.jsx"', app, '```'].join('\n');
}

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Desk Job', latencyMs: 16, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

// Phase A strips the probe out of the compiled page. A criterion nobody could
// observe must read unverified — never a pass, never a fail.
let probeEnabled = false;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user: { sub: 'desk-job-user', name: 'Job Reader', email: 'job@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/preview-compile') {
    const body = request.postDataJSON?.() || {};
    try {
      // Production passes the correlation id through; without it the desk
      // filters out every message the running page sends.
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      const html = probeEnabled
        ? compiled.html
        : compiled.html.replace('__quantoraDeskRun();', '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...compiled, html }) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.message || 'Preview compilation failed.' }) });
    }
  }
  if (path === '/api/chat') {
    const message = String(request.postDataJSON?.()?.message || '');
    const reply = /drive\s*cleaner|google drive/i.test(message)
      ? driveCleanerReply()
      : /newton|study/i.test(message)
        ? 'Sure — we can study Newton\'s laws. Tell me which chapter to open first.<!-- quantora-ctx: {"goal":"I want to study newton laws of motion. prepare me","understanding":"Study session for Newton\'s laws."} -->'
        : /footer/i.test(message)
          ? patchReply(todoApp({ working: false, footer: true }))
          : /add button|fix/i.test(message)
            ? patchReply(todoApp({ working: true, footer: true }))
            : projectReply(todoApp({ working: false, footer: false }));
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(reply) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 12_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function frameShowing(selector, text, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const node = frame.locator(selector).first();
      if (await node.isVisible().catch(() => false)) {
        if (!text || new RegExp(text).test(await node.innerText().catch(() => ''))) return frame;
      }
    }
    await page.waitForTimeout(200);
  }
  return null;
}

const probeRows = () => page.evaluate(() => Array.from(
  document.querySelectorAll('[data-quantora-desk-probes="true"] [data-quantora-desk-probe]'),
).map((node) => ({
  id: node.getAttribute('data-quantora-desk-probe'),
  state: node.getAttribute('data-quantora-desk-probe-state'),
  ok: node.getAttribute('data-quantora-desk-probe-ok'),
  label: (node.textContent || '').trim(),
})));

const nextBeat = () => page.evaluate(() => (
  document.querySelector('[data-quantora-desk-next="true"]')?.textContent || ''
).trim());

async function settledRows(expect, what) {
  await page.waitForFunction((wanted) => {
    const rows = Array.from(document.querySelectorAll('[data-quantora-desk-probes="true"] [data-quantora-desk-probe]'));
    const row = rows.find((node) => node.getAttribute('data-quantora-desk-probe') === wanted.id);
    return Boolean(row) && row.getAttribute('data-quantora-desk-probe-state') === wanted.state;
  }, expect, { timeout: 25_000 }).catch(() => {});
  const rows = await probeRows();
  const row = rows.find((entry) => entry.id === expect.id);
  if (!row) throw new Error(`${what}: no "${expect.id}" review row at all. Rows: ${JSON.stringify(rows)}`);
  if (row.state !== expect.state) {
    throw new Error(`${what}: "${expect.id}" read "${row.state}" instead of "${expect.state}". Rows: ${JSON.stringify(rows)}`);
  }
  return rows;
}

/** The guardrail line has no question the page can answer. It must say so. */
function assertGuardrailUnverified(rows, what) {
  const guardrail = rows.find((row) => /Keep this a to-do list/i.test(row.label));
  if (!guardrail) throw new Error(`${what}: the desk dropped the must-work line it cannot check. Rows: ${JSON.stringify(rows)}`);
  if (guardrail.state !== 'unverified' || guardrail.ok === 'true') {
    throw new Error(`${what}: a criterion nobody probed was reported as "${guardrail.state}". Rows: ${JSON.stringify(rows)}`);
  }
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('build me a to-do list app for my week');
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

  await visible(page.locator('[data-quantora-real-project-preview="true"]').first(), 'The to-do list never entered the real project preview.', 20_000);
  if (!(await frameShowing('h1', 'My day'))) {
    throw new Error('Preview never rendered the to-do list, so there is no running desk to review.');
  }

  const jobLabel = page.locator('[data-quantora-desk-job="true"]').first();
  await visible(jobLabel, 'The desk did not name the job this Preview is for.');
  if (!/to-?do/i.test((await jobLabel.innerText()).trim())) {
    throw new Error(`The desk read the job as "${(await jobLabel.innerText()).trim()}" instead of a to-do list.`);
  }

  // This panel is the whole point: before this beat a generic desk had none.
  await visible(
    page.locator('[data-quantora-desk-probes="true"]').first(),
    'A desk that is neither a shop nor a calculator still has no Preview checks.',
    20_000,
  );

  // Phase A — the page was never asked, so nothing may be claimed about it.
  const unaskedRows = await settledRows({ id: 'job-add-item', state: 'unverified' }, 'unprobed desk');
  assertGuardrailUnverified(unaskedRows, 'unprobed desk');
  if (unaskedRows.some((row) => row.ok === 'true')) {
    throw new Error(`A desk whose page was never probed reported a passing check: ${JSON.stringify(unaskedRows)}`);
  }
  if (await nextBeat()) {
    throw new Error(`The desk invented a beat from criteria it never checked: ${await nextBeat()}`);
  }

  // Positive control: the mock injected a claim that the list works. Chat
  // must not keep that sentence as fact; the beat still must not echo it.
  const transcript = await page.locator('.app-shell--studio').first().innerText();
  if (transcript.includes(CHAT_CLAIM)) {
    throw new Error('Chat presented the injected lie as fact. Preview is the source of truth.');
  }
  if (!/Preview has not confirmed that an item can be added yet/i.test(transcript)
    && !/Preview cannot add an item yet/i.test(transcript)) {
    throw new Error('Chat never received the injected add-item claim, so this gate cannot prove the beat ignores chat.');
  }

  // Phase B — same broken button, but now the running page gets asked.
  probeEnabled = true;
  await prompt.fill('Add a footer to the list');
  await prompt.press('Enter');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click();
  if (!(await frameShowing('footer', 'Quantora desk'))) {
    throw new Error('The follow-up never reached Preview, so the desk was never re-probed.');
  }

  const brokenRows = await settledRows({ id: 'job-add-item', state: 'fix' }, 'broken add button');
  assertGuardrailUnverified(brokenRows, 'broken add button');
  const brokenBeat = await nextBeat();
  if (!/Adding an item does nothing on the running Preview/i.test(brokenBeat)) {
    throw new Error(`The beat did not come from the running desk. Saw: ${brokenBeat || '(none)'}`);
  }
  if (/items can be added/i.test(brokenBeat) || brokenBeat.includes(CHAT_CLAIM)) {
    throw new Error(`The beat echoed chat instead of the running desk: ${brokenBeat}`);
  }

  // The dead button is observable, so prove the probe read the real page.
  const brokenFrame = await frameShowing('h1', 'My day');
  const itemsBefore = await brokenFrame.locator('li').count();
  await brokenFrame.locator('input[type="text"]').first().fill('Written by the gate');
  await brokenFrame.locator('button').filter({ hasText: /^Add$/ }).first().click();
  await page.waitForTimeout(400);
  if ((await brokenFrame.locator('li').count()) !== itemsBefore) {
    throw new Error('The gate expected a dead Add button but the running page added an item.');
  }

  // Phase C — fix the button; the same criterion must flip on live evidence.
  await prompt.fill('Fix the add button so items land in the list');
  await prompt.press('Enter');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click();
  await page.waitForTimeout(600);

  const fixedRows = await settledRows({ id: 'job-add-item', state: 'ok' }, 'working add button');
  assertGuardrailUnverified(fixedRows, 'working add button');
  const fixedRow = fixedRows.find((row) => row.id === 'job-add-item');
  if (fixedRow.ok !== 'true' || !/can be added on the running Preview/i.test(fixedRow.label)) {
    throw new Error(`A satisfied criterion did not read as satisfied: ${JSON.stringify(fixedRow)}`);
  }
  const fixedBeat = await nextBeat();
  if (/Adding an item does nothing/i.test(fixedBeat)) {
    throw new Error(`The desk still names a beat the running Preview already satisfies: ${fixedBeat}`);
  }

  const fixedFrame = await frameShowing('h1', 'My day');
  const beforeFix = await fixedFrame.locator('li').count();
  await fixedFrame.locator('input[type="text"]').first().fill('Written by the gate');
  await fixedFrame.locator('button').filter({ hasText: /^Add$/ }).first().click();
  await fixedFrame.waitForFunction((count) => document.querySelectorAll('li').length > count, beforeFix, { timeout: 8_000 });

  // --- Drive Cleaner hygiene: shop probes and Study goals must not bleed in ---
  // New chat clears the todo VFS (a product switch was rejected as check regression).
  await page.locator('button').filter({ hasText: /^New Chat$/ }).first().click();
  await page.waitForTimeout(500);
  // Seed sticky Study goal into this chat's conversationContext without opening Study desk.
  await page.evaluate(() => {
    const key = 'quantora_chat_sessions';
    const sessions = JSON.parse(localStorage.getItem(key) || '[]');
    const projectId = sessions[0]?.projectId || 'default';
    localStorage.setItem(key, JSON.stringify([{
      id: 'session-drive-gate',
      title: 'Drive Cleaner',
      createdAt: Date.now(),
      projectId,
      messages: [{ id: Date.now(), sender: 'ai', type: 'greeting', text: 'Ready when you are.' }],
      studioMode: 'ask',
      studioDomain: null,
      conversationContext: {
        goal: 'I want to study newton laws of motion. prepare me',
        understanding: 'Drive Cleaner Agent dashboard is in Preview.',
      },
    }]));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterSignedInStudio(page);

  const drivePrompt = page.locator('.app-shell--studio textarea').first();
  await visible(drivePrompt, 'Studio prompt input missing for Drive cleaner hygiene.');
  await drivePrompt.fill('build a Drive Cleaner Agent web dashboard for my Google Drive');
  await drivePrompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click({ timeout: 15_000 }).catch(() => {});

  await visible(page.locator('[data-quantora-real-project-preview="true"]').first(), 'Drive Cleaner never entered Preview.', 25_000);
  if (!(await frameShowing('h1', 'Drive Cleaner'))) {
    throw new Error('Preview never rendered the Drive Cleaner dashboard.');
  }

  const missionCard = page.locator('[data-quantora-mission="true"]').first();
  await visible(missionCard, 'Mission card missing for Drive Cleaner desk.', 12_000);
  const missionText = (await missionCard.innerText()).trim();
  if (!/Drive|cleaner/i.test(missionText)) {
    throw new Error(`Mission card did not name Drive Cleaner. Saw: ${missionText}`);
  }
  if (/newton/i.test(missionText)) {
    throw new Error(`Mission card kept the Study Newton goal on a Coding desk. Saw: ${missionText}`);
  }

  await visible(page.locator('[data-quantora-desk-probes="true"]').first(), 'Drive Cleaner desk has no Preview checks panel.', 15_000);
  const driveRows = await probeRows();
  const shopLabels = driveRows.filter((row) => /Add to Cart|Product photos|Currency|catalog item/i.test(row.label));
  if (shopLabels.length) {
    throw new Error(`Drive Cleaner Review fired shop checks: ${JSON.stringify(shopLabels)}`);
  }
  if (driveRows.some((row) => ['photos', 'cart', 'currency', 'catalog', 'cart-click'].includes(row.id))) {
    throw new Error(`Drive Cleaner Review has shop probe ids: ${JSON.stringify(driveRows)}`);
  }

  const partner = (await page.locator('[data-quantora-partner-status="true"]').innerText().catch(() => '')).trim();
  if (/Product photos are still missing/i.test(partner)) {
    throw new Error(`Partner status claimed missing product photos on a non-shop desk: ${partner}`);
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-job-review.png', fullPage: true });
  console.log('Desk job review browser gate passed. A generic desk derives its criteria from the job card and probes them on the running page. Drive Cleaner stays free of shop probes and Study mission bleed.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-job-review-failure.png', fullPage: true }).catch(() => {});
  console.error('Desk job review browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
