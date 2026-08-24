#!/usr/bin/env node
/**
 * Chat cannot outrun Preview.
 *
 * CI cannot stand up a real /api/chat, so this gate injects a lying assistant
 * reply against a to-do whose Add control does nothing. The client filter must
 * rewrite that sentence from the desk packet / probes. The lie must not be the
 * last word in the chat bubble.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const LIE = 'Items can be added on Preview. The add control is working.';

const todoApp = `import React, { useState } from 'react';

export default function App() {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState(['Ship the review gate']);
  function add() {
    // The add control is wired to nothing yet.
  }
  return (
    <main>
      <h1>My day</h1>
      <input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What needs doing?" />
      <button onClick={add}>Add</button>
      <ul>
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </main>
  );
}
`;

const lyingReply = [
  LIE,
  '',
  '```json filepath="package.json"',
  JSON.stringify({
    name: 'desk-chat-claim', private: true, version: '1.0.0', type: 'module',
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
  todoApp,
  '```',
  '',
  '```css filepath="src/index.css"',
  'body{margin:0;font-family:system-ui;background:#0f172a;color:#f8fafc}main{padding:32px}',
  '```',
].join('\n');

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Desk Claim', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

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
      user: { sub: 'desk-chat-claim-user', name: 'Claim Reader', email: 'claim@quantora.test', picture: null, isAdmin: false },
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
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.message || 'Preview compilation failed.' }) });
    }
  }
  if (path === '/api/chat') {
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(lyingReply),
    });
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

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('build me a to-do list app for my week');
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

  await visible(page.locator('[data-quantora-real-project-preview="true"]').first(), 'The to-do list never entered Preview.', 20_000);
  if (!(await frameShowing('h1', 'My day'))) {
    throw new Error('Preview never rendered the to-do list, so there is no running page to judge chat against.');
  }

  await visible(
    page.locator('[data-quantora-desk-probes="true"]').first(),
    'Desk packet never produced Preview checks, so chat could not be judged against Preview.',
    20_000,
  );

  const prose = page.locator('[data-quantora-assistant-prose="true"]').last();
  await visible(prose, 'Assistant chat never rendered, so the lie could not be judged.', 20_000);
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-quantora-assistant-prose="true"]');
    return Boolean(node && node.textContent && node.getAttribute('data-quantora-desk-claim-filter') === 'true');
  }, null, { timeout: 15_000 }).catch(() => {});

  const shown = ((await prose.innerText().catch(() => '')) || '').trim();
  if (!shown) throw new Error('Assistant prose was empty after the injected lie.');
  if (/Items can be added on Preview/i.test(shown) || /add control is working/i.test(shown)) {
    throw new Error(`Chat presented the injected lie as fact: ${shown.slice(0, 300)}`);
  }
  if (!/Preview cannot add an item yet/i.test(shown)
    && !/Preview has not confirmed that an item can be added yet/i.test(shown)) {
    throw new Error(`Chat dropped the lie but never said what Preview actually does. Saw: ${shown.slice(0, 300)}`);
  }
  if ((await prose.getAttribute('data-quantora-desk-claim-filter')) !== 'true') {
    throw new Error('Chat never marked the reply as filtered against the desk packet.');
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-chat-claim.png', fullPage: true });
  console.log('Desk chat claim browser gate passed. An injected lie was not presented as fact.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-chat-claim-failure.png', fullPage: true }).catch(() => {});
  console.error('Desk chat claim browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
