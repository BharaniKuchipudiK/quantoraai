#!/usr/bin/env node
/**
 * The review beat of the coding desk was half real.
 *
 * Preview checks were probed against the running iframe, but the only diff on
 * the desk was a filename with a line count next to it, and the Git pane's
 * "Diff" button printed `M src/App.jsx` — a file list wearing a diff's label.
 * A reader could see that the desk had touched a file and never see what it
 * did to it, which is the one thing a review is for.
 *
 * This gate commits a baseline, proves a clean tree reports nothing, then
 * patches one line through chat and demands the exact removed and added lines
 * back out of the Git pane — scoped to a hunk, on the one file that changed.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const OLD_HEADING = '      <h1>Mission Control is alive</h1>';
const NEW_HEADING = '      <h1>Mission Control is patched</h1>';

const appSource = (heading) => [
  'export default function App() {',
  '  return (',
  '    <main>',
  heading,
  '      <p>Docking bay clear.</p>',
  '      <p>Fuel margin nominal.</p>',
  '      <p>Crew roster locked.</p>',
  '      <p>Telemetry is nominal.</p>',
  '      <p>Heat shield green.</p>',
  '    </main>',
  '  );',
  '}',
].join('\n');

// Far enough past the changed line that a whole-file dump cannot pass as a hunk.
const OUT_OF_HUNK = ['Telemetry is nominal', 'Heat shield green'];

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Desk Diff', latencyMs: 14, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const projectReply = [
  'Done — here is the implementation.',
  '',
  '```json filepath="package.json"',
  JSON.stringify({
    name: 'mission-control-review', private: true, version: '1.0.0', type: 'module',
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
  appSource(OLD_HEADING),
  '```',
  '',
  '```css filepath="src/index.css"',
  'body{margin:0;font-family:system-ui;background:#111827;color:#fff}main{padding:48px}',
  '```',
].join('\n');

const patchReply = [
  'Updated the heading.',
  '',
  '```jsx filepath="src/App.jsx"',
  appSource(NEW_HEADING),
  '```',
].join('\n');

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
      user: { sub: 'desk-diff-user', name: 'Review Reader', email: 'review@quantora.test', picture: null, isAdmin: false },
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
      // Production bakes this id into the iframe. Dropping it here makes the
      // desk discard every desk-probe message, so Review would pass on source.
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.message || 'Preview compilation failed.' }) });
    }
  }
  if (path === '/api/chat') {
    const message = String(request.postDataJSON?.()?.message || '');
    const reply = /patched|heading/i.test(message) ? patchReply : projectReply;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(reply) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function frameShowing(selector, text, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const node = frame.locator(selector).first();
      if (await node.isVisible().catch(() => false)) {
        if (new RegExp(text).test(await node.innerText().catch(() => ''))) return frame;
      }
    }
    await page.waitForTimeout(200);
  }
  return null;
}

/** Read the rendered log as classified lines, never as one blob of text. */
function readGitLines() {
  return page.evaluate(() => Array.from(document.querySelectorAll(
    '[data-quantora-studio-git-log="true"] [data-quantora-studio-git-line]',
  )).map((node) => ({ kind: node.getAttribute('data-quantora-studio-git-line'), text: node.textContent || '' })));
}

async function runGit(selector, command) {
  const before = (await readGitLines()).length;
  await page.locator(selector).first().click();
  await page.waitForFunction((count) => {
    const panel = document.querySelector('[data-quantora-studio-git="true"]')?.innerText || '';
    const rows = document.querySelectorAll('[data-quantora-studio-git-log="true"] [data-quantora-studio-git-line]').length;
    return rows > count + 1 && !/running…/.test(panel);
  }, before, { timeout: 20_000 }).catch(() => {});

  const lines = await readGitLines();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].kind === 'command' && lines[index].text.trim() === `$ git ${command}`) start = index;
  }
  if (start < 0) throw new Error(`Git pane never ran "git ${command}".`);
  const block = [];
  for (let index = start + 1; index < lines.length && lines[index].kind !== 'command'; index += 1) {
    block.push(lines[index]);
  }
  if (!block.length) throw new Error(`Git pane ran "git ${command}" and printed nothing.`);
  return block;
}

const asText = (block) => block.map((line) => line.text).join('\n');

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill("let's build a mission control interface for a launch team");
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

  await visible(page.locator('[data-quantora-real-project-preview="true"]').first(), 'Mission control never entered the real project preview.', 20_000);
  if (!(await frameShowing('h1', 'Mission Control is alive'))) {
    throw new Error('Preview never rendered the project, so there is no running desk to review.');
  }

  const isolated = await page.evaluate(() => window.crossOriginIsolated === true);
  if (!isolated) throw new Error('Coding desk is not isolated, so the Git pane cannot run.');

  await page.locator('[data-quantora-studio-git-nav="true"]').click();
  await visible(page.locator('[data-quantora-studio-git="true"]').first(), 'Git pane did not open.');
  await page.waitForFunction(() => /src\/App\.jsx/.test(
    document.querySelector('[data-quantora-studio-git-log="true"]')?.innerText || '',
  ), null, { timeout: 15_000 }).catch(() => {});
  const primed = await readGitLines();
  if (!primed.some((line) => line.text.includes('src/App.jsx'))) {
    throw new Error('Git pane opened without reading the Preview tree.');
  }

  // No commit yet: the pane must say so rather than print filenames as a diff.
  const virgin = await runGit('[data-quantora-studio-git-diff="true"]', 'diff');
  if (!/No commits yet/i.test(asText(virgin))) {
    throw new Error(`Git diff invented a baseline before any commit. Saw: ${asText(virgin).slice(0, 300)}`);
  }
  if (virgin.some((line) => line.kind === 'add' || line.kind === 'del' || line.kind === 'hunk')) {
    throw new Error('Git diff produced diff lines with nothing to diff against.');
  }

  const message = page.locator('[data-quantora-studio-git-message="true"]').first();
  await visible(message, 'Git commit message input is missing.');
  await message.fill('Baseline the mission control tree');
  const committed = await runGit('[data-quantora-studio-git-commit="true"]', 'commit');
  if (!asText(committed).includes('Baseline the mission control tree')) {
    throw new Error(`Git commit did not record the Preview tree. Saw: ${asText(committed).slice(0, 300)}`);
  }

  // Positive control: a clean tree must report nothing, or "no diff" proves nothing.
  const clean = await runGit('[data-quantora-studio-git-diff="true"]', 'diff');
  if (!/working tree clean/i.test(asText(clean))) {
    throw new Error(`Git diff on an unchanged tree was not clean. Saw: ${asText(clean).slice(0, 300)}`);
  }
  if (clean.some((line) => line.kind === 'add' || line.kind === 'del' || line.kind === 'hunk')) {
    throw new Error('Git diff reported changed lines on a tree that nobody touched.');
  }

  await prompt.fill('Change the heading to Mission Control is patched');
  await prompt.press('Enter');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click();
  if (!(await frameShowing('h1', 'Mission Control is patched'))) {
    throw new Error('The follow-up never reached Preview, so there is no patch to review.');
  }

  await page.locator('[data-quantora-studio-git-nav="true"]').click();
  await visible(page.locator('[data-quantora-studio-git="true"]').first(), 'Git pane did not reopen after the patch.');
  const patched = await runGit('[data-quantora-studio-git-diff="true"]', 'diff');
  const patchedText = asText(patched);

  const removed = patched.filter((line) => line.kind === 'del').map((line) => line.text);
  const added = patched.filter((line) => line.kind === 'add').map((line) => line.text);
  if (!removed.includes(`-${OLD_HEADING}`)) {
    throw new Error(`Git diff did not show the removed heading line. Removed lines: ${JSON.stringify(removed).slice(0, 300)}`);
  }
  if (!added.includes(`+${NEW_HEADING}`)) {
    throw new Error(`Git diff did not show the added heading line. Added lines: ${JSON.stringify(added).slice(0, 300)}`);
  }
  if (!patched.some((line) => line.kind === 'hunk' && /^@@ -\d+,\d+ \+\d+,\d+ @@$/.test(line.text.trim()))) {
    throw new Error(`Git diff printed changed lines without a hunk header. Saw: ${patchedText.slice(0, 300)}`);
  }
  if (!patched.some((line) => line.text === 'diff --git a/src/App.jsx b/src/App.jsx')) {
    throw new Error('Git diff never named src/App.jsx as the changed file.');
  }
  if (!patchedText.includes('Docking bay clear')) {
    throw new Error('Git diff dropped the context around the change.');
  }
  for (const path of ['index.html', 'package.json', 'src/main.jsx', 'src/index.css']) {
    if (patched.some((line) => line.kind === 'file' && line.text.includes(path))) {
      throw new Error(`Git diff claimed ${path} changed when only src/App.jsx was patched.`);
    }
  }
  for (const stranger of OUT_OF_HUNK) {
    if (patchedText.includes(stranger)) {
      throw new Error(`Git diff dumped the whole file instead of a hunk: it printed "${stranger}".`);
    }
  }

  const status = await runGit('[data-quantora-studio-git-status="true"]', 'status');
  const modified = status.filter((line) => /^\s*M\s/.test(line.text)).map((line) => line.text.trim());
  if (!modified.some((line) => line.endsWith('src/App.jsx'))) {
    throw new Error(`Git status did not mark src/App.jsx modified after the patch. Saw: ${asText(status).slice(0, 300)}`);
  }
  if (modified.length !== 1) {
    throw new Error(`Git status marked ${modified.length} files modified for a one-file patch: ${modified.join(', ')}`);
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-diff-review.png', fullPage: true });
  console.log('Desk diff review browser gate passed. Git diff shows the real removed and added lines for the patched file only.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-diff-review-failure.png', fullPage: true }).catch(() => {});
  console.error('Desk diff review browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
