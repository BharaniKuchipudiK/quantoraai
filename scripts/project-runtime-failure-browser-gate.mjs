#!/usr/bin/env node
/**
 * Regression gate for the Hira Silks preview incident.
 *
 * Pins three lifecycle contracts through the real Coding Desk:
 * 1) /api/preview-compile HTTP 422 becomes "Preview failed to run".
 * 2) a compiled iframe that misses the ready deadline fails terminally and a
 *    late ready message cannot resurrect that generation.
 * 3) a later valid generation can still recover and reach Preview running.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Preview Lifecycle', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

function projectReply(marker, title) {
  return [
    `Updated ${title}.`,
    '',
    '```json filepath="package.json"',
    JSON.stringify({
      name: 'hira-silks-preview-regression', private: true, version: '1.0.0', type: 'module',
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
    }),
    '```',
    '',
    '```html filepath="index.html"',
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
    '```',
    '',
    '```jsx filepath="src/main.jsx"',
    "import { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\ncreateRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);",
    '```',
    '',
    '```jsx filepath="src/App.jsx"',
    `export default function App(){return <main><h1>${title}</h1><p>${marker}</p></main>}`,
    '```',
  ].join('\n');
}

const replies = [
  projectReply('SCENARIO_422', 'Hira Silks'),
  projectReply('SCENARIO_LATE_READY', 'Hira Silks Late Ready'),
  projectReply('SCENARIO_RECOVERED', 'Hira Silks Recovered'),
];
let chatTurn = 0;

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
      user: { sub: 'preview-lifecycle-user', name: 'Preview Lifecycle', email: 'preview@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/chat') {
    const reply = replies[Math.min(chatTurn, replies.length - 1)];
    chatTurn += 1;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(reply),
    });
  }
  if (path === '/api/preview-compile') {
    const body = request.postDataJSON?.() || {};
    const serialized = JSON.stringify(body.vfs || {});
    if (serialized.includes('SCENARIO_422')) {
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic Hira Silks compiler failure (422).' }),
      });
    }
    if (serialized.includes('SCENARIO_LATE_READY')) {
      const cid = JSON.stringify(body.correlationId || null);
      const html = `<!doctype html><html><body><div id="root">Late preview</div><script>setTimeout(function(){parent.postMessage({__quantoraProjectPreview:true,kind:'ready',correlationId:${cid}},'*')},8000)</script></body></html>`;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ html, correlationId: body.correlationId || null }),
      });
    }
    try {
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.message || 'Preview compilation failed.' }) });
    }
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 20_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function sendPrompt(text) {
  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill(text);
  await prompt.press('Enter');
}

async function frameShowing(text, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const heading = frame.locator('h1').first();
      if (await heading.isVisible().catch(() => false)) {
        const shown = await heading.innerText().catch(() => '');
        if (shown.includes(text)) return true;
      }
    }
    await page.waitForTimeout(200);
  }
  return false;
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  await sendPrompt('Build Hira Silks as a React boutique website');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  await visible(page.locator('[data-quantora-real-project-preview="true"]').first(), 'Hira Silks never entered project Preview.');
  await visible(page.getByText('Preview failed to run', { exact: true }).first(), 'HTTP 422 did not reach the Coding Desk failed status.');
  await visible(page.locator('[data-quantora-preview-error="true"][role="alert"]').first(), 'HTTP 422 did not surface a terminal Preview error.');
  const firstError = await page.locator('[data-quantora-preview-error="true"][role="alert"]').first().innerText();
  if (!/Synthetic Hira Silks compiler failure \(422\)/.test(firstError)) {
    throw new Error(`Compiler 422 body was not surfaced safely. Saw: ${firstError}`);
  }
  if (await page.getByText('Preview is starting…', { exact: true }).first().isVisible().catch(() => false)) {
    throw new Error('Coding Desk remained on Preview is starting… after compiler HTTP 422.');
  }

  await sendPrompt('Replace the project with the late-ready regression generation');
  await visible(
    page.locator('[data-quantora-preview-error="true"][role="alert"]').filter({ hasText: 'did not report that it rendered' }).first(),
    'Compiled iframe did not become terminal after the render deadline.',
    15_000,
  );
  await visible(page.getByText('Preview failed to run', { exact: true }).first(), 'Render timeout did not propagate failed status.');
  // The synthetic iframe posts ready at 8s, one second after the 7s parent
  // deadline. The failed generation must remain failed after that late message.
  await page.waitForTimeout(2_000);
  await visible(page.getByText('Preview failed to run', { exact: true }).first(), 'Late ready resurrected a terminal failed generation.');
  if (await page.getByText('Preview is running', { exact: true }).first().isVisible().catch(() => false)) {
    throw new Error('Late ready changed the failed generation back to Preview is running.');
  }

  await sendPrompt('Replace the project with a valid recovered generation');
  if (!(await frameShowing('Hira Silks Recovered', 20_000))) {
    throw new Error('A new valid generation could not recover after the prior terminal failures.');
  }
  await visible(page.getByText('Preview is running', { exact: true }).first(), 'Recovered generation never reached Preview running.');
  if (await page.locator('[data-quantora-preview-error="true"][role="alert"]').first().isVisible().catch(() => false)) {
    throw new Error('Stale terminal error leaked into the recovered generation.');
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/project-runtime-failure.png', fullPage: true });
  console.log('Project runtime failure browser gate passed: 422 terminal, late ready ignored, next generation recovered.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/project-runtime-failure-failure.png', fullPage: true }).catch(() => {});
  console.error('Project runtime failure browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
