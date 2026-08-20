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
  const fork = page.locator('[data-quantora-fork-chat]').first();
  await visible(arena, 'Dual Arena was not restored in the new Studio shell.');
  await visible(fork, 'Fork Chat was not added to the Studio shell.');
  await hidden(page.getByRole('button', { name: /^Reset Chat$/i }).first(), 'Reset Chat is visible again.');

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill("let's build a mission control interface, similar to the expose-style window manager on macOS");
  await prompt.press('Enter');

  const workspace = page.locator('[data-quantora-legacy-workspace="true"]').first();
  await visible(workspace, 'Generated project did not open the right-side workspace.', 15_000);

  const preview = workspace.locator('[data-quantora-real-project-preview="true"]').first();
  await visible(preview, 'Multi-file Vite project did not switch to a real project preview.', 15_000);
  const runtimeLayout = preview.locator('[data-quantora-project-runtime-status]').first();
  await visible(runtimeLayout, 'Project preview runtime never reached a Sandpack layout.', 15_000);
  await page.waitForFunction(() => {
    const runtime = document.querySelector('[data-quantora-project-runtime-status]');
    return runtime && runtime.getAttribute('data-quantora-project-runtime-status') === 'idle';
  }, null, { timeout: 20_000 }).catch(() => {});

  const workspaceText = await workspace.innerText().catch(() => '');
  if (/\{"name":"mission-control-recovery"/.test(workspaceText)) {
    throw new Error('Preview is still exposing package.json as the application result.');
  }
  if (/filepath=["']index\.html["']/i.test(workspaceText)) {
    throw new Error('Preview is leaking fenced filepath metadata into the rendered result.');
  }

  await hidden(workspace.locator('button[title="Publish to Vercel"]').first(), 'Publish is still visible in the build workspace.');
  await hidden(workspace.locator('button[title^="Copy a shareable preview link"]').first(), 'Share link is still visible in the build workspace.');

  const filePicker = workspace.locator('[data-quantora-file-picker="true"]').first();
  await visible(filePicker, 'Project files were not compacted into a single Files picker.');
  await hidden(workspace.locator('button').filter({ hasText: /^src\/App\.jsx$/ }).first(), 'Every source file is still being exposed as a permanent top tab.');
  await filePicker.selectOption('src/App.jsx');
  const editor = workspace.locator('textarea').first();
  await visible(editor, 'Project source editor is missing.');
  const editorValue = await editor.inputValue();
  if (!editorValue.includes('Mission Control is alive')) {
    throw new Error('Files picker did not navigate to the selected source file.');
  }

  const messagePreview = page.locator('button[title="Preview"]').first();
  if (await messagePreview.isVisible().catch(() => false)) {
    await messagePreview.click();
    const docked = page.locator('[data-quantora-docked-preview="true"]').first();
    await visible(docked, 'Quick Preview still opens as a blocking full-screen overlay.');
    const box = await docked.boundingBox();
    if (!box || box.width >= 1100 || box.x < 500) {
      throw new Error(`Quick Preview is not docked on the right (${JSON.stringify(box)}).`);
    }
    await hidden(docked.locator('button[title="Publish to Vercel"]').first(), 'Publish is visible in the docked quick preview.');
    await hidden(docked.locator('button[title^="Copy a shareable preview link"]').first(), 'Share link is visible in the docked quick preview.');
    await docked.locator('button[title="Close preview (Esc)"]').first().click();
  }

  await arena.click();
  await page.waitForTimeout(80);
  if (!/Arena Active/i.test(await arena.innerText())) throw new Error('Dual Arena proxy did not activate the underlying arena state.');

  const sessionsBeforeFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  await fork.click();
  await page.waitForLoadState('domcontentloaded');
  const sessionsAfterFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  if (sessionsAfterFork.length <= sessionsBeforeFork.length) throw new Error('Fork Chat did not create an independent session.');
  const forked = sessionsAfterFork[0];
  if (!forked?.parentSessionId || !forked?.forkedAt) throw new Error('Forked chat is missing ancestry metadata.');

  console.log('Studio regression recovery browser gate passed.');
} catch (error) {
  console.error('Studio regression recovery browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
