#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Studio Recovery', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const calculatorReply = [
  'Done — here is a working calculator.',
  '',
  '```jsx',
  "import React, { useState } from 'react';\nimport { Delete, Divide, Minus, Plus, X, Equal } from 'lucide-react';\nimport './App.css';\nexport default function Calculator(){ const [value,setValue]=useState('0'); return <main style={{padding:24}}><output data-testid='calculator-display'>{value}</output><button data-testid='calculator-one' onClick={()=>setValue('1')}>1</button><Delete /></main>}",
  '```',
].join('\n');

const projectReply = [
  'Done — here is the implementation.',
  '',
  '```json filepath="package.json"',
  JSON.stringify({
    name: 'mission-control-recovery', private: true, version: '1.0.0', type: 'module',
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
  "export default function App(){return <main><h1>Mission Control is alive</h1><p>Real project preview.</p></main>}",
  '```',
  '',
  '```css filepath="src/index.css"',
  'body{margin:0;font-family:system-ui;background:#111827;color:#fff}main{padding:48px}',
  '```',
].join('\n');

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user: { sub: 'studio-recovery-user', name: 'Recovery User', email: 'recovery@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
      { id: 'synthetic-b', name: 'Synthetic B', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/preview-compile') {
    const body = request.postDataJSON?.() || {};
    try {
      const compiled = await compilePreviewVfs(body.vfs || {});
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.errors?.[0]?.text || error?.message || 'Preview compilation failed.' }) });
    }
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    const reply = /calculator/i.test(String(body.message || '')) ? calculatorReply : projectReply;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(reply) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 8000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}
async function hidden(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}
async function visibleFrame(selector, timeout = 20000) {
  const deadline = Date.now() + timeout;
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
  await enterSignedInStudio(page);

  if (await page.locator('[data-quantora-sidebar-profile]').count()) throw new Error('Duplicate Profile entry leaked into the Studio sidebar.');
  if (await page.locator('[data-quantora-sidebar-canvas]').count()) throw new Error('Duplicate Canvas entry leaked into the Studio sidebar.');
  await visible(page.getByRole('button', { name: /^Journey$/i }).first(), 'Global Journey/Canvas entry is missing.');

  const profile = page.locator('button[aria-controls="quantora-profile-menu"]').first();
  await visible(profile, 'Header Profile entry is missing.');
  await page.mouse.move(1400, 12);
  await page.waitForTimeout(250);
  await profile.click({ timeout: 15_000, force: true });
  const accountMenu = page.locator('#quantora-profile-menu').first();
  await visible(accountMenu, 'Header Profile did not open the real account menu.');
  const changePicture = accountMenu.locator('[data-quantora-profile-picture-entry]').first();
  await visible(changePicture, 'Account menu does not contain Change profile picture.');
  await changePicture.click();
  await visible(page.locator('[data-quantora-profile-personalizer]').first(), 'Change profile picture did not open the avatar chooser.');
  await page.getByRole('button', { name: 'Close profile picture chooser' }).click();

  const arena = page.locator('[data-quantora-dual-arena]').first();
  await visible(arena, 'Dual Arena is missing from the Studio shell.');
  await hidden(page.locator('[data-quantora-fork-chat]').first(), 'Fork Chat is incorrectly placed in the top bar.');

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('Build me a simple calculator');
  await prompt.press('Enter');

  const calculatorPreview = page.locator('[data-quantora-real-project-preview="true"]').first();
  await visible(calculatorPreview, 'Calculator did not enter the real project preview.', 15_000);
  await hidden(page.locator('[data-quantora-preview-error="true"]').first(), 'Calculator compiler surfaced a preview error.', 15_000);
  const calculatorFrame = await visibleFrame('[data-testid="calculator-display"]', 20_000);
  if (!calculatorFrame) throw new Error('Calculator compiled, but its rendered DOM never appeared.');
  const display = calculatorFrame.locator('[data-testid="calculator-display"]').first();
  if ((await display.innerText()).trim() !== '0') throw new Error('Calculator rendered with the wrong initial value.');
  await calculatorFrame.locator('[data-testid="calculator-one"]').first().click();
  await calculatorFrame.waitForFunction(() => document.querySelector('[data-testid="calculator-display"]')?.textContent?.trim() === '1');
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/studio-calculator-preview.png', fullPage: true });

  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChat, 'New Chat control is missing after calculator preview.');
  await newChat.click();
  await prompt.fill("let's build a mission control interface, similar to the expose-style window manager on macOS");
  await prompt.press('Enter');

  const preview = page.locator('[data-quantora-real-project-preview="true"]').first();
  await visible(preview, 'Multi-file Vite project did not switch to real project preview.', 15_000);
  const missionFrame = await visibleFrame('h1', 20_000);
  if (!missionFrame || !/Mission Control is alive/.test(await missionFrame.locator('h1').first().innerText().catch(() => ''))) {
    throw new Error('Multi-file project compiler did not render the application.');
  }

  const fileTab = page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: 'src/App.jsx' }).first();
  await visible(fileTab, 'Expected project file tab was not generated.');
  await fileTab.click();
  const editor = page.locator('[data-quantora-monaco="true"]').first();
  await visible(editor, 'Project source editor is missing.', 15_000);
  await page.locator('[data-quantora-monaco-ready="true"]').first().waitFor({ state: 'attached', timeout: 15_000 });
  const source = await page.evaluate(() => {
    const models = window.monaco?.editor?.getModels?.() || [];
    return models.map((model) => model.getValue()).join('\n');
  });
  if (!String(source).includes('Mission Control is alive')) throw new Error('Selected file displays the wrong source.');

  const fork = page.locator('[data-quantora-message-fork="true"]').last();
  await visible(fork, 'Fork Chat was not placed in the completed response footer.');
  await arena.click();
  await page.waitForTimeout(120);
  if (!/Arena Active/i.test(await arena.innerText())) throw new Error('Dual Arena did not activate.');
  await visible(page.getByRole('button', { name: /VS:/ }).first(), 'Dual Arena did not expose Model B selection.');

  const sessionsBeforeFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  await fork.click();
  await page.waitForLoadState('domcontentloaded');
  const sessionsAfterFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  if (sessionsAfterFork.length <= sessionsBeforeFork.length) throw new Error('Footer Fork Chat did not create an independent session.');

  console.log('Studio regression recovery browser gate passed with self-hosted compiler runtime.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/studio-regression-failure.png', fullPage: true }).catch(() => {});
  console.error('Studio regression recovery browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
