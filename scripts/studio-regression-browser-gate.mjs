#!/usr/bin/env node
import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts/e2e', { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
let codesandboxRequests = 0;

page.on('request', (request) => {
  if (/codesandbox\.io/i.test(request.url())) codesandboxRequests += 1;
});

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Studio Hardening', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
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

function esmMock(url) {
  const pathname = new URL(url).pathname;
  if (/react@[^/]+\/(?:jsx-runtime|jsx-dev-runtime)$/.test(pathname)) {
    return `
const Fragment = Symbol.for('react.fragment');
const make = (type, props, key) => ({ type, props: props || {}, key: key ?? null });
export { Fragment };
export const jsx = make;
export const jsxs = make;
export const jsxDEV = make;
`;
  }
  if (/react-dom@[^/]+\/client$/.test(pathname)) {
    return `
function mount(value) {
  if (value == null || value === false || value === true) return document.createTextNode('');
  if (typeof value === 'string' || typeof value === 'number') return document.createTextNode(String(value));
  if (Array.isArray(value)) { const f = document.createDocumentFragment(); value.forEach(v => f.append(mount(v))); return f; }
  if (typeof value.type === 'function') return mount(value.type(value.props || {}));
  if (typeof value.type === 'symbol') return mount(value.props?.children || []);
  const el = document.createElement(value.type || 'div');
  const props = value.props || {};
  for (const [key, prop] of Object.entries(props)) {
    if (key === 'children' || prop == null || typeof prop === 'function') continue;
    if (key === 'className') el.setAttribute('class', String(prop));
    else if (key === 'style' && typeof prop === 'object') Object.assign(el.style, prop);
    else if (!key.startsWith('on')) el.setAttribute(key, String(prop));
  }
  const children = props.children == null ? [] : (Array.isArray(props.children) ? props.children : [props.children]);
  children.forEach(child => el.append(mount(child)));
  return el;
}
export function createRoot(container) { return { render(value) { container.replaceChildren(mount(value)); } }; }
export default { createRoot };
`;
  }
  if (/react@[^/]+$/.test(pathname)) {
    return `
export const Fragment = Symbol.for('react.fragment');
export function createElement(type, props, ...children) { return { type, props: { ...(props || {}), children: children.length <= 1 ? children[0] : children } }; }
export default { createElement, Fragment };
`;
  }
  return 'export default {};';
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
});

await page.route('https://esm.sh/**', async (route) => {
  // Keep the project in a visible boot state long enough to prove that the user
  // sees Quantora's controlled status rather than an iframe/browser error.
  await new Promise((resolve) => setTimeout(resolve, 450));
  await route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: esmMock(route.request().url()),
  });
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

async function assertNotClipped(locator, name) {
  const result = await locator.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  if (result.scrollWidth > result.clientWidth + 2 || result.scrollHeight > result.clientHeight + 2) {
    throw new Error(`${name} is visually clipped: ${JSON.stringify(result)}`);
  }
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
  await visible(profile.locator('[data-quantora-avatar-fallback]').first(), 'Broken profile image did not fall back to an initial/avatar.');

  await profile.click();
  const accountMenu = page.locator('#quantora-profile-menu').first();
  await visible(accountMenu, 'Profile click did not open the real account menu.');
  const changePicture = accountMenu.locator('[data-quantora-profile-picture-entry]').first();
  await visible(changePicture, 'Account menu does not contain Change profile picture.');
  await changePicture.click();
  await visible(page.locator('[data-quantora-profile-personalizer]').first(), 'Change profile picture did not open the avatar chooser.');
  await page.getByRole('button', { name: 'Close profile picture chooser' }).click();

  const arena = page.locator('[data-quantora-native-arena="true"]').first();
  await visible(arena, 'Native Dual Arena is not visible in Studio.');
  await hidden(page.getByRole('button', { name: /^Reset Chat$/i }).first(), 'Reset Chat is visible again.');
  await hidden(page.locator('[data-quantora-conversation-actions]').first(), 'Legacy proxy conversation controls are still visible.');
  await assertNotClipped(arena, 'Dual Arena');

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill("let's build a mission control interface, similar to the expose-style window manager on macOS");
  await prompt.press('Enter');

  const workspace = page.locator('[data-quantora-legacy-workspace="true"]').first();
  await visible(workspace, 'Generated project did not open the right-side workspace.', 15_000);

  const runtime = workspace.locator('[data-quantora-project-runtime="true"]').first();
  await visible(runtime, 'Quantora project runtime did not mount.', 15_000);
  await visible(runtime.locator('[data-quantora-preview-preparing="true"]').first(), 'Preview did not show a controlled preparing state before runtime readiness.', 5000);
  const bootText = await workspace.innerText().catch(() => '');
  if (/refused to connect|rejected|Couldn't connect to server|TIME_OUT|Sandpack/i.test(bootText)) {
    throw new Error(`Raw runtime/browser failure leaked during preview boot: ${bootText.slice(0, 300)}`);
  }

  await page.waitForFunction(() => {
    const host = document.querySelector('[data-quantora-project-runtime="true"]');
    return host?.dataset.runtimeState === 'ready' && /Mission Control is alive/.test(host.dataset.runtimeBodyText || '');
  }, null, { timeout: 20_000 });

  const projectFrame = runtime.locator('iframe[title="Quantora project preview"]').first();
  await visible(projectFrame, 'Project runtime iframe is missing.');
  const handle = await projectFrame.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error('Could not inspect the isolated project runtime frame.');
  await frame.waitForSelector('h1', { state: 'visible', timeout: 5000 });
  const renderedHeading = await frame.locator('h1').innerText();
  if (renderedHeading !== 'Mission Control is alive') {
    throw new Error(`Generated React application did not render correctly: ${renderedHeading}`);
  }

  const workspaceBox = await workspace.boundingBox();
  if (!workspaceBox || workspaceBox.x < 650 || workspaceBox.width < 500 || workspaceBox.width > 1000) {
    throw new Error(`Preview workspace is not a stable right-side Canvas: ${JSON.stringify(workspaceBox)}`);
  }

  const workspaceText = await workspace.innerText().catch(() => '');
  if (/\{"name":"mission-control-recovery"/.test(workspaceText)) throw new Error('Preview is exposing package.json as the application result.');
  if (/filepath=["']index\.html["']/i.test(workspaceText)) throw new Error('Preview is leaking fenced filepath metadata into the rendered result.');
  if (/refused to connect|rejected|Couldn't connect to server|TIME_OUT|Sandpack/i.test(workspaceText)) throw new Error('A raw runtime/browser error leaked into the user experience.');

  await hidden(page.locator('.app-shell--studio button[title="Publish to Vercel"]').first(), 'Publish is still visible in the working Canvas.');
  await hidden(page.locator('.app-shell--studio button[title^="Copy a shareable preview link"]').first(), 'Share link is still visible in the working Canvas.');

  const filePicker = workspace.locator('[data-quantora-file-picker="true"]').first();
  await visible(filePicker, 'Project files were not compacted into a single Files control.');
  await hidden(workspace.locator('button').filter({ hasText: /^src\/App\.jsx$/ }).first(), 'Generated source files are still permanent top tabs.');

  const fork = page.locator('[data-quantora-message-fork="true"]').last();
  await visible(fork, 'Fork Chat did not replace the message overflow action.');
  await assertNotClipped(fork, 'Fork Chat');
  await hidden(page.locator('button[title="More"]').first(), 'Three-dot overflow is still visible.');
  await hidden(page.getByText('Report issue', { exact: true }).first(), 'Duplicate Report issue action is still exposed.');
  await hidden(page.getByText('Read aloud', { exact: true }).first(), 'Read aloud overflow menu is still exposed.');

  await page.screenshot({ path: 'artifacts/e2e/studio-project-preview.png', fullPage: false });

  await filePicker.selectOption('src/App.jsx');
  const editor = workspace.locator('textarea').first();
  await visible(editor, 'Project source editor is missing.');
  const editorValue = await editor.inputValue();
  if (!editorValue.includes('Mission Control is alive')) throw new Error('Files control did not navigate to the selected source file.');

  const messagePreview = page.locator('button[title="Preview"]').first();
  if (await messagePreview.isVisible().catch(() => false)) {
    await messagePreview.click();
    await page.waitForTimeout(150);
    await hidden(page.locator('[data-quantora-docked-preview="true"]').first(), 'Message Preview created a second preview window instead of using the right Canvas.');
    await visible(runtime, 'Message Preview did not return to the existing right-side project Canvas.');
  }

  await arena.click();
  await page.waitForTimeout(120);
  if (!/Arena Mode Active/i.test(await arena.innerText())) throw new Error('Native Dual Arena did not activate its React arenaMode state.');
  await visible(page.getByRole('button', { name: /VS:/ }).first(), 'Dual Arena did not expose the second-model control.');
  await page.screenshot({ path: 'artifacts/e2e/studio-dual-arena.png', fullPage: false });

  if (codesandboxRequests !== 0) {
    throw new Error(`Studio still contacted CodeSandbox/Sandpack ${codesandboxRequests} time(s).`);
  }

  const sessionsBeforeFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  await fork.click();
  await page.waitForLoadState('domcontentloaded');
  const sessionsAfterFork = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_chat_sessions') || '[]'));
  if (sessionsAfterFork.length <= sessionsBeforeFork.length) throw new Error('Fork Chat did not create an independent session.');
  const forked = sessionsAfterFork[0];
  if (!forked?.parentSessionId || !forked?.forkedAt) throw new Error('Forked chat is missing ancestry metadata.');

  console.log('Studio precision browser gate passed.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/e2e/studio-precision-failure.png', fullPage: false }).catch(() => {});
  console.error('Studio precision browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}