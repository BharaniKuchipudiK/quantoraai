#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';

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

const projectReply = [
  'Done — here is the implementation.',
  '',
  '```json filepath="package.json"',
  JSON.stringify({
    name: 'mission-control-recovery',
    private: true,
    version: '1.0.0',
    type: 'module',
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
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          sub: 'studio-recovery-user',
          name: 'Recovery User',
          email: 'recovery@quantora.test',
          picture: 'https://broken-avatar.quantora.invalid/avatar.png',
          isAdmin: false,
        },
      }),
    });
  }

  if (path === '/api/models') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
          { id: 'synthetic-b', name: 'Synthetic B', provider: 'Synthetic', available: true },
        ],
      }),
    });
  }

  if (path === '/api/chat') {
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(projectReply),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [], sessions: [], ok: true }),
  });
});

async function visible(locator, message, timeout = 8000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function hidden(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const studio = page.getByRole('button', { name: /^(AI )?Studio$/i }).first();
  await visible(studio, 'Studio navigation is missing.');
  await studio.click();

  const profile = page.locator('[data-quantora-sidebar-profile]').first();
  await visible(profile, 'Sidebar Profile entry is missing.');
  await page.route('https://broken-avatar.quantora.invalid/**', (route) => route.abort());
  await page.waitForTimeout(250);

  const fallback = profile.locator('[data-quantora-avatar-fallback]').first();
  await visible(fallback, 'Broken profile image did not fall back to an initial/avatar.');

  await profile.click();
  const accountMenu = page.locator('#quantora-profile-menu').first();
  await visible(accountMenu, 'Profile click did not open the real account menu.');
  const changePicture = accountMenu.locator('[data-quantora-profile-picture-entry]').first();
  await visible(changePicture, 'Account menu does not contain Change profile picture.');
  await changePicture.click();
  const personalizer = page.locator('[data-quantora-profile-personalizer]').first();
  await visible(personalizer, 'Change profile picture did not open the avatar chooser.');
  await page.getByRole('button', { name: 'Close profile picture chooser' }).click();

  const arena = page.locator('[data-quantora-dual-arena]').first();
  await visible(arena, 'Dual Arena is missing from the Studio shell.');
  await hidden(page.locator('[data-quantora-fork-chat]').first(), 'Fork Chat is still incorrectly placed in the top conversation bar.');
  await hidden(page.getByRole('button', { name: /^Reset Chat$/i }).first(), 'Reset Chat is visible again.');

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill("let's build a mission control interface, similar to the expose-style window manager on macOS");
  await prompt.press('Enter');

  const preview = page.locator('[data-quantora-real-project-preview="true"]').first();
  await visible(preview, 'Multi-file Vite project did not switch to a real project preview.', 15_000);

  const workspaceText = await page.locator('[data-quantora-legacy-workspace="true"]').first().innerText().catch(() => '');
  if (/\{"name":"mission-control-recovery"/.test(workspaceText)) {
    throw new Error('Preview is still exposing package.json as the application result.');
  }

  const fileTabs = page.locator('[data-quantora-legacy-workspace="true"] button').filter({ hasText: 'src/App.jsx' }).first();
  await visible(fileTabs, 'Expected project file tab was not generated.');
  await fileTabs.click();
  const editor = page.locator('[data-quantora-legacy-workspace="true"] textarea').first();
  await visible(editor, 'Project source editor is missing.');
  const editorValue = await editor.inputValue();
  if (!editorValue.includes('Mission Control is alive')) {
    throw new Error('File tabs still display the wrong shared source instead of the selected file.');
  }

  const fork = page.locator('[data-quantora-message-fork="true"]').last();
  await visible(fork, 'Fork Chat was not placed in the completed assistant response footer.');
  await hidden(page.locator('button[title="More"]').first(), 'Legacy three-dot response overflow is still visible.');

  await arena.click();
  await page.waitForTimeout(120);
  if (!/Arena Active/i.test(await arena.innerText())) throw new Error('Dual Arena did not activate the underlying React arena state.');
  await visible(page.getByRole('button', { name: /VS:/ }).first(), 'Dual Arena activation did not expose the second-model control.');

  const sessionsBeforeFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  await fork.click();
  await page.waitForLoadState('domcontentloaded');
  const sessionsAfterFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  if (sessionsAfterFork.length <= sessionsBeforeFork.length) throw new Error('Footer Fork Chat did not create an independent session.');
  const forked = sessionsAfterFork[0];
  if (!forked?.parentSessionId || !forked?.forkedAt || !forked?.forkedFromMessageId) {
    throw new Error('Forked chat is missing response ancestry metadata.');
  }

  console.log('Studio regression recovery browser gate passed.');
} catch (error) {
  console.error('Studio regression recovery browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
