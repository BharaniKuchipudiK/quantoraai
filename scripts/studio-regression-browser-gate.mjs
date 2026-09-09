#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { listingShowsGeneratedProjectFile } from '../src/lib/studio-workspace-tree.js';
import { assertJourneyEntry } from './lib/parked-surfaces.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const STUDIO_RECOVERY_SUB = 'studio-recovery-user';
const STUDIO_RECOVERY_EMAIL = 'recovery@quantora.test';
// The browser session response intentionally exposes email, not the server's
// internal subject, so the hook's authenticated fallback scope is this email.
const ACCOUNT_CHAT_SESSIONS_KEY = `quantora_chat_sessions:account:${encodeURIComponent(STUDIO_RECOVERY_EMAIL)}`;
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

const scientificReply = [
  'Updated — scientific keys are on the running Preview.',
  '',
  '```jsx',
  "import React, { useState } from 'react';\nimport { Delete } from 'lucide-react';\nimport './App.css';\nexport default function Calculator(){ const [value,setValue]=useState('0'); return <main style={{padding:24}}><output data-testid='calculator-display'>{value}</output><button data-testid='calculator-one' onClick={()=>setValue('1')}>1</button><button type='button'>sin</button><button type='button'>cos</button><button type='button'>DEG</button><Delete /></main>}",
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

const BOUTIQUE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/5eZ3GQAAAABJRU5ErkJggg==';

const patchReply = [
  'Updated the heading.',
  '',
  '```jsx filepath="src/App.jsx"',
  "export default function App(){return <main><h1>Mission Control is patched</h1><p>Real project preview.</p></main>}",
  '```',
].join('\n');

const boutiqueReply = [
  'Here is the boutique.',
  '',
  '```json filepath="products.json"',
  '[{"id":"silk","name":"Kanjeevaram Silk","priceCents":1800000,"currency":"inr"}]',
  '```',
  '',
  '```html filepath="index.html"',
  '<!DOCTYPE html><html><body><header>Aaranya</header><main><div class="product-card"><img src="/api/preview-image?fixture=boutique" alt="Silk"><p>Kanjeevaram</p><span class="price">INR 18000</span><button type="button">Add to Cart</button></div></main></body></html>',
  '```',
].join('\n');

const currencyReply = [
  'Added a currency picker to the running preview.',
  '',
  '```jsx filepath="src/App.jsx"',
  "export default function App(){return <main><h1>Mission Control is patched</h1><label>Currency <select data-testid='currency-select'><option>USD</option><option>INR</option></select></label><p>Real project preview.</p></main>}",
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
      user: { sub: STUDIO_RECOVERY_SUB, name: 'Recovery User', email: STUDIO_RECOVERY_EMAIL, picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
      { id: 'synthetic-b', name: 'Synthetic B', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/preview-image') {
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(BOUTIQUE_PNG_BASE64, 'base64'),
    });
  }
  if (path === '/api/preview-compile') {
    const body = request.postDataJSON?.() || {};
    try {
      // The desk drops iframe messages whose correlation id does not match the
      // one it asked to compile with, so a mock that omits it proves nothing
      // about the running page.
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.errors?.[0]?.text || error?.message || 'Preview compilation failed.' }) });
    }
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    const message = String(body.message || '');
    const reply = /saree|boutique|kanjeevaram/i.test(message)
      ? boutiqueReply
      : /currency/i.test(message)
      ? (body.refineMode === true && String(body.previewCode || '').trim()
        ? currencyReply
        : 'Sure — I added a currency converter to the boutique.')
      : /scientific/i.test(message)
        ? scientificReply
      : /calculator/i.test(message)
        ? calculatorReply
        : /patched|heading/i.test(message)
          ? patchReply
          : projectReply;
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

/** Terminal ls and Git status/commit must list the same files Preview is running. */
async function proveDeskFilesMatchPreview(job) {
  await page.locator('[data-quantora-studio-terminal-nav="true"]').click();
  const terminal = page.locator('[data-quantora-studio-terminal="true"]').first();
  await visible(terminal, `${job}: Terminal panel did not open.`);
  const terminalText = await terminal.innerText();
  if (/cannot start on this page/i.test(terminalText)) {
    throw new Error(`${job}: Terminal still said it cannot start on the isolated desk.`);
  }
  if (/No files in this desk yet/i.test(terminalText)) {
    throw new Error(`${job}: Preview is running but Terminal said there are no files.`);
  }
  const terminalInput = page.locator('[data-quantora-studio-terminal-input="true"]').first();
  await visible(terminalInput, `${job}: Terminal input is missing after Preview.`);
  await terminalInput.fill('ls');
  await terminalInput.press('Enter');
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-quantora-studio-terminal="true"]')?.innerText || '';
    const text = document.querySelector('[data-quantora-studio-terminal-log="true"]')?.innerText || '';
    return /index\.html|src\/App\.jsx|src\/main\.jsx/.test(text) && !/running…/.test(panel);
  }, null, { timeout: 8_000 }).catch(() => {});
  const lsText = await page.locator('[data-quantora-studio-terminal-log="true"]').first().innerText().catch(() => '');
  if (!listingShowsGeneratedProjectFile(lsText)) {
    throw new Error(`${job}: Terminal ls did not list the Preview project files. Saw: ${String(lsText || terminalText).slice(0, 400)}`);
  }

  await page.locator('[data-quantora-studio-git-nav="true"]').click();
  await visible(page.locator('[data-quantora-studio-git="true"]').first(), `${job}: Git panel did not open.`);
  await visible(page.locator('[data-quantora-studio-git-status="true"]').first(), `${job}: Git status control is missing.`);
  await hidden(page.locator('[data-quantora-monaco="true"]').first(), `${job}: Git tab still showed the file editor.`);
  const gitPanel = page.locator('[data-quantora-studio-git="true"]').first();
  if (/No files in this desk yet|cannot start on this page/i.test(await gitPanel.innerText())) {
    throw new Error(`${job}: Preview is running but Git said it cannot use those files.`);
  }
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-quantora-studio-git-log="true"]')?.innerText || '';
    return /index\.html|src\/App\.jsx|src\/main\.jsx/.test(text);
  }, null, { timeout: 8_000 }).catch(() => {});
  if (!listingShowsGeneratedProjectFile(await page.locator('[data-quantora-studio-git-log="true"]').first().innerText().catch(() => ''))) {
    await page.locator('[data-quantora-studio-git-status="true"]').first().click();
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-quantora-studio-git-log="true"]')?.innerText || '';
      return /index\.html|src\/App\.jsx|src\/main\.jsx/.test(text);
    }, null, { timeout: 8_000 }).catch(() => {});
  }
  const gitLog = await page.locator('[data-quantora-studio-git-log="true"]').first().innerText().catch(() => '');
  if (!listingShowsGeneratedProjectFile(gitLog)) {
    throw new Error(`${job}: Git status did not operate on the Preview tree. Saw: ${String(gitLog).slice(0, 400)}`);
  }

  const message = page.locator('[data-quantora-studio-git-message="true"]').first();
  await visible(message, `${job}: Git commit message input is missing.`);
  await message.fill(`Save the ${job} Preview tree`);
  await page.locator('[data-quantora-studio-git-commit="true"]').first().click();
  await page.waitForFunction((expected) => {
    const panel = document.querySelector('[data-quantora-studio-git="true"]')?.innerText || '';
    const text = document.querySelector('[data-quantora-studio-git-log="true"]')?.innerText || '';
    return text.includes(expected) && /index\.html|src\/App\.jsx|src\/main\.jsx/.test(text) && !/running…/.test(panel);
  }, `Save the ${job} Preview tree`, { timeout: 8_000 }).catch(() => {});
  const commitLog = await page.locator('[data-quantora-studio-git-log="true"]').first().innerText().catch(() => '');
  if (!commitLog.includes(`Save the ${job} Preview tree`) || !listingShowsGeneratedProjectFile(commitLog)) {
    throw new Error(`${job}: Git commit did not record the Preview tree. Saw: ${String(commitLog).slice(0, 400)}`);
  }
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  if (await page.locator('[data-quantora-sidebar-canvas]').count()) throw new Error('Duplicate Canvas entry leaked into the Studio sidebar.');
  await assertJourneyEntry(page, visible, 'Studio');

  /*
   * ONE PROFILE ENTRY, AND IT OPENS THE REAL MENU (2026-09-07).
   *
   * The account control moved into the Studio sidebar; the header stands
   * down there (profileInShell) so there is exactly one. This used to assert
   * the sidebar had NO profile entry and then drove the header's — the shape
   * has moved, the property has not: one entry, and it must reach the one
   * real menu rather than a second copy of it. That copy is the incident
   * (installProfileMenuBridge) this check exists for, so the count is
   * asserted first and the menu's own contents are still exercised below.
   */
  const sidebarProfile = page.locator('[data-quantora-sidebar-profile]');
  const headerProfile = page.locator('button[aria-controls="quantora-profile-menu"]');
  const entryCount = (await sidebarProfile.count()) + (await headerProfile.count());
  if (entryCount !== 1) {
    throw new Error(`The Studio must show exactly one account entry; found ${entryCount} (sidebar ${await sidebarProfile.count()}, header ${await headerProfile.count()}). Two entries is the duplicate-profile regression.`);
  }
  const profile = sidebarProfile.first();
  await visible(profile, 'The Studio sidebar account entry is missing — the header stands down here, so nothing would open the account menu.');
  await profile.click({ timeout: 15_000, force: true });
  const accountMenu = page.locator('#quantora-profile-menu').first();
  await visible(accountMenu, 'The sidebar account entry did not open the real account menu — a trigger that opens nothing is worse than no trigger.');
  /*
   * OPENING IS NOT ENOUGH — IT MUST OPEN *HERE* (2026-09-07).
   *
   * The first cut of this step asserted only that the menu appeared, and
   * that passed while the anchor was being dropped: the trigger sent
   * `detail.rect` where Header reads `detail.anchorRect`, so positioning
   * fell back to the header's now-empty profile container and the menu
   * opened by the top bar, far from the button clicked. A check that
   * cannot see that is a check that would let it ship.
   */
  const triggerBox = await profile.boundingBox();
  const menuBox = await accountMenu.boundingBox();
  if (!triggerBox || !menuBox) throw new Error('Could not measure the account trigger or its menu.');
  const drift = Math.abs(menuBox.x - triggerBox.x);
  if (drift > 320) {
    throw new Error(`The account menu opened ${Math.round(drift)}px from the sidebar control that opened it (trigger x=${Math.round(triggerBox.x)}, menu x=${Math.round(menuBox.x)}). It is anchored to the wrong element — check that the trigger sends detail.anchorRect, the key Header reads.`);
  }
  const changePicture = accountMenu.locator('[data-quantora-profile-picture-entry]').first();
  await visible(changePicture, 'Account menu does not contain Change profile picture.');
  await changePicture.click();
  await visible(page.locator('[data-quantora-profile-personalizer]').first(), 'Change profile picture did not open the avatar chooser.');
  await page.getByRole('button', { name: 'Close profile picture chooser' }).click();

  // Dual Arena is intentionally hidden across all workspaces now — assert its absence.
  await hidden(page.locator('[data-quantora-dual-arena]').first(), 'Dual Arena should be hidden from the Studio shell.');
  await hidden(page.locator('[data-quantora-fork-chat]').first(), 'Fork Chat is incorrectly placed in the top bar.');
  await hidden(page.locator('[data-quantora-code-workspace="true"]').first(), 'Coding desk opened before it was selected.');

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('Build me a simple calculator');
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

  const calculatorPreview = page.locator('[data-quantora-real-project-preview="true"]').first();
  await visible(calculatorPreview, 'Calculator did not enter the real project preview.', 15_000);
  await hidden(page.locator('[data-quantora-preview-error="true"]').first(), 'Calculator compiler surfaced a preview error.', 15_000);
  const calculatorFrame = await visibleFrame('[data-testid="calculator-display"]', 20_000);
  if (!calculatorFrame) throw new Error('Calculator compiled, but its rendered DOM never appeared.');
  const display = calculatorFrame.locator('[data-testid="calculator-display"]').first();
  if ((await display.innerText()).trim() !== '0') throw new Error('Calculator rendered with the wrong initial value.');
  await calculatorFrame.locator('[data-testid="calculator-one"]').first().click();
  await calculatorFrame.waitForFunction(() => document.querySelector('[data-testid="calculator-display"]')?.textContent?.trim() === '1');
  await visible(page.locator('[data-quantora-desk-review="true"]').first(), 'Coding desk did not show a Review of files that actually changed.');
  const runStatus = page.locator('[data-quantora-preview-run-status="true"]').first();
  await visible(runStatus, 'Coding desk did not say whether Preview is starting, running, or failed.');
  const runText = (await runStatus.innerText()).trim();
  if (!/Preview is (starting|running|fixing)/i.test(runText) && !/Preview failed/i.test(runText)) {
    throw new Error(`Preview run status was not honest: ${runText || '(empty)'}`);
  }
  const jobLabel = page.locator('[data-quantora-desk-job="true"]').first();
  await visible(jobLabel, 'Coding desk did not name the job this Preview is for.');
  if (!/calculator/i.test((await jobLabel.innerText()).trim())) {
    throw new Error('Calculator Preview was missing a calculator job card.');
  }
  await visible(page.locator('[data-quantora-desk-probes="true"]').first(), 'Coding desk did not show Preview checks against the running job.');
  const calcProbe = page.locator('[data-quantora-desk-probe="calc-display"]').first();
  await visible(calcProbe, 'Calculator display probe was missing.');
  await page.waitForFunction(() => {
    const display = document.querySelector('[data-quantora-desk-probe="calc-display"]');
    const key = document.querySelector('[data-quantora-desk-probe="calc-key"]');
    return display?.getAttribute('data-quantora-desk-probe-ok') === 'true'
      && key?.getAttribute('data-quantora-desk-probe-ok') === 'true';
  }, null, { timeout: 12_000 }).catch(() => {});
  if ((await calcProbe.getAttribute('data-quantora-desk-probe-ok')) !== 'true') {
    throw new Error('Calculator display probe failed while the calculator was running.');
  }
  const calcKeyProbe = page.locator('[data-quantora-desk-probe="calc-key"]').first();
  if ((await calcKeyProbe.getAttribute('data-quantora-desk-probe-ok')) !== 'true') {
    throw new Error('Calculator key probe passed from source instead of the running page.');
  }
  await visible(page.locator('[data-quantora-publish="true"]').first(), 'A running website desk did not offer Publish.');
  const partner = page.locator('[data-quantora-partner-status="true"]').first();
  if (await partner.isVisible().catch(() => false)) {
    const partnerText = (await partner.innerText()).trim();
    if (/no runnable preview/i.test(partnerText)) {
      throw new Error('Chat said there is no Preview while the calculator was running.');
    }
  }

  const isolation = await page.evaluate(() => ({
    path: window.location.pathname,
    isolated: window.crossOriginIsolated === true,
  }));
  if (!/\/desk\/?$/.test(isolation.path)) {
    throw new Error(`Studio opened on ${isolation.path || '(none)'} instead of the isolated /desk page.`);
  }
  if (!isolation.isolated) {
    throw new Error('Coding desk is not isolated, so Terminal and Git cannot run.');
  }
  await proveDeskFilesMatchPreview('calculator');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click();

  // Refine must update the Preview entry — not only sidecar .py files.
  await prompt.fill('can you modify this to be a scientific calculator');
  await prompt.press('Enter');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click();
  // Wait for sin specifically — a generic button match would pass on the old basic calculator.
  let scientificFrame = null;
  {
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && !scientificFrame) {
      for (const frame of page.frames()) {
        const sinBtn = frame.locator('button').filter({ hasText: /^sin$/i }).first();
        if (await sinBtn.isVisible().catch(() => false)) {
          scientificFrame = frame;
          break;
        }
      }
      if (!scientificFrame) await page.waitForTimeout(200);
    }
  }
  if (!scientificFrame) throw new Error('Scientific refine never remounted Preview with sin/cos keys.');
  const hasSin = await scientificFrame.locator('button').filter({ hasText: /^sin$/i }).first().isVisible().catch(() => false);
  const hasCos = await scientificFrame.locator('button').filter({ hasText: /^cos$/i }).first().isVisible().catch(() => false);
  if (!hasSin || !hasCos) {
    throw new Error('Scientific refine claimed an update but Preview still lacks sin/cos keys.');
  }
  await page.waitForFunction(() => {
    const row = document.querySelector('[data-quantora-desk-probe="calc-display"]');
    return row?.getAttribute('data-quantora-desk-probe-ok') === 'true';
  }, null, { timeout: 12_000 }).catch(() => {});
  if ((await page.locator('[data-quantora-desk-probe="calc-display"]').first().getAttribute('data-quantora-desk-probe-ok')) !== 'true') {
    throw new Error('Calculator display probe failed after the scientific refine while the display was on Preview.');
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/studio-calculator-preview.png', fullPage: true });

  await page.waitForTimeout(700);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);
  const restoredDesk = page.locator('[data-quantora-code-workspace="true"]').first();
  if (!(await restoredDesk.isVisible().catch(() => false))) {
    await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  }
  await visible(restoredDesk, 'Coding desk did not come back after reload.', 15_000);
  const restoredCalc = await visibleFrame('[data-testid="calculator-display"]', 20_000);
  if (!restoredCalc) throw new Error('The running calculator did not survive reload. Preview is the product.');

  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChat, 'New Chat control is missing after calculator preview.');
  await newChat.click();
  await prompt.fill("let's build a mission control interface, similar to the expose-style window manager on macOS");
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

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

  await prompt.fill('Change the heading to Mission Control is patched');
  await prompt.press('Enter');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click();
  const patchedFrame = await visibleFrame('h1', 20_000);
  if (!patchedFrame || !/Mission Control is patched/.test(await patchedFrame.locator('h1').first().innerText().catch(() => ''))) {
    throw new Error('Follow-up did not update Preview with the new heading.');
  }
  await visible(
    page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: 'index.html' }).first(),
    'Follow-up dropped the rest of the project files.',
  );

  // A patch that only reaches the iframe leaves the desk lying about its own
  // files: the editor, ls and Git would still describe the pre-patch tree.
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: 'src/App.jsx' }).first().click();
  await visible(page.locator('[data-quantora-monaco="true"]').first(), 'Editor did not reopen after the patch.', 15_000);
  await page.locator('[data-quantora-monaco-ready="true"]').first().waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForFunction(() => (window.monaco?.editor?.getModels?.() || [])
    .some((model) => model.getValue().includes('Mission Control is patched')), null, { timeout: 15_000 }).catch(() => {});
  const patchedSource = await page.evaluate(() => (window.monaco?.editor?.getModels?.() || [])
    .map((model) => model.getValue()).join('\n'));
  if (!String(patchedSource).includes('Mission Control is patched')) {
    throw new Error('Preview shows the patch but the desk editor still shows the old source.');
  }

  await page.locator('[data-quantora-studio-terminal-nav="true"]').click();
  const patchedTerminalInput = page.locator('[data-quantora-studio-terminal-input="true"]').first();
  await visible(patchedTerminalInput, 'Terminal input is missing after the patch.');
  await patchedTerminalInput.fill('cat src/App.jsx');
  await patchedTerminalInput.press('Enter');
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-quantora-studio-terminal="true"]')?.innerText || '';
    return /Mission Control is patched/.test(panel) && !/running…/.test(panel);
  }, null, { timeout: 10_000 }).catch(() => {});
  const catText = await page.locator('[data-quantora-studio-terminal="true"]').first().innerText().catch(() => '');
  if (!/Mission Control is patched/.test(catText)) {
    throw new Error(`Terminal read the pre-patch file. Saw: ${String(catText).slice(-400)}`);
  }

  await prompt.fill('Please include a currency converter');
  await prompt.press('Enter');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click();
  const currencyFrame = await visibleFrame('[data-testid="currency-select"]', 20_000);
  if (!currencyFrame) {
    throw new Error('A running-desk follow-up only talked. Preview must change when the user asks for a control.');
  }

  await newChat.click();
  await prompt.fill('Build a Kanjeevaram saree boutique');
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  const boutiqueFrame = await visibleFrame('.product-card', 20_000);
  if (!boutiqueFrame) throw new Error('Boutique Preview never rendered.');
  const addToCart = boutiqueFrame.locator('button').filter({ hasText: /add to cart/i }).first();
  await visible(addToCart, 'Boutique Preview is missing Add to Cart.', 15_000);
  await visible(page.locator('[data-quantora-desk-probe="cart"][data-quantora-desk-probe-ok="true"]').first(), 'Cart observation is not ready.');
  await boutiqueFrame.waitForFunction(() => Boolean(document.querySelector('[data-quantora-bag="true"], [data-quantora-shop-ui="bar"]')), { timeout: 15_000 }).catch(() => {});
  await boutiqueFrame.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, a')).find((node) => /add to (bag|cart)/i.test(node.textContent || ''));
    btn?.click();
  });
  const bagCount = boutiqueFrame.locator('[data-quantora-bag="true"], button').filter({ hasText: /^Bag\s+[1-9]/ }).first();
  await visible(bagCount, 'Add to Cart is on Preview but the bag did not increment.', 12_000);
  await visible(
    page.locator('[data-quantora-desk-probe="cart-click"][data-quantora-desk-probe-ok="true"]').first(),
    'Boutique did not confirm a live Add to Cart probe.',
    15_000,
  );
  for (const id of ['catalog', 'photos', 'currency', 'cart']) {
    const row = page.locator(`[data-quantora-desk-probe="${id}"][data-quantora-desk-probe-ok="true"]`).first();
    await visible(row, `Boutique ${id} probe did not pass from the running page.`, 12_000);
  }

  await proveDeskFilesMatchPreview('boutique');

  await prompt.fill('Keep the boutique cart under budget and show prices in INR');
  await prompt.press('Enter');
  await page.getByText(/Keep the boutique cart under budget/i).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(800);
  const domainAfterShopFollowUp = await page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
  if (['finance', 'travel', 'education', 'research'].includes(domainAfterShopFollowUp)) {
    throw new Error(`Coding desk jumped to ${domainAfterShopFollowUp} after a boutique cart/budget follow-up.`);
  }
  await visible(page.locator('[data-quantora-code-workspace="true"]').first(), 'Coding desk vanished after a boutique budget follow-up.');
  if (await page.locator('[data-quantora-active-specialist="finance"]').count()) {
    throw new Error('Finance Advisor stole the coding session after a shop follow-up.');
  }

  // Broader sticky check: Study / Travel / Research cues must not steal either.
  for (const followUp of [
    'also help me study for the JEE exam',
    'also help me plan a trip with hotels',
    'research the literature for this boutique',
  ]) {
    await prompt.fill(followUp);
    await prompt.press('Enter');
    await page.getByText(followUp.slice(0, 24), { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
    await page.waitForTimeout(600);
    const domain = await page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
    if (['finance', 'travel', 'education', 'research'].includes(domain)) {
      throw new Error(`Coding desk jumped to ${domain} after: ${followUp}`);
    }
    await visible(page.locator('[data-quantora-code-workspace="true"]').first(), `Coding desk vanished after: ${followUp}`);
  }

  const fork = page.locator('[data-quantora-message-fork="true"]').last();
  await visible(fork, 'Fork Chat was not placed in the completed response footer.');

  const readSessions = () => page.evaluate((storageKey) => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  }, ACCOUNT_CHAT_SESSIONS_KEY);
  const legacySessionsBeforeFork = await page.evaluate(() => localStorage.getItem('quantora_chat_sessions'));
  const sessionsBeforeFork = await readSessions();
  await fork.click();
  await page.waitForLoadState('domcontentloaded');

  /*
   * WAIT FOR THE WRITE, DO NOT SNAPSHOT IT.
   *
   * Forking creates the session in React state and persists it to localStorage
   * from an effect, so the write lands after the click resolves and after
   * domcontentloaded. Reading immediately made this assertion a coin flip: it
   * failed once in CI on 2026-09-03 and passed on the identical commit, with no
   * code change between the runs.
   *
   * Same defect and same fix as the QIR journal check in
   * qir-production-recovery-browser-gate.mjs (#522). A fork that never happens
   * still fails here, with the counts named; only the timing assumption
   * changes, never the claim.
   */
  let sessionsAfterFork = sessionsBeforeFork;
  const forkDeadline = Date.now() + 10_000;
  for (;;) {
    sessionsAfterFork = await readSessions();
    if (sessionsAfterFork.length > sessionsBeforeFork.length) break;
    if (Date.now() >= forkDeadline) {
      throw new Error(
        `Footer Fork Chat did not create an independent session: ${ACCOUNT_CHAT_SESSIONS_KEY} held `
        + `${sessionsBeforeFork.length} before the click and still holds ${sessionsAfterFork.length} `
        + 'after 10s.',
      );
    }
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  const legacySessionsAfterFork = await page.evaluate(() => localStorage.getItem('quantora_chat_sessions'));
  if (legacySessionsAfterFork !== legacySessionsBeforeFork) {
    throw new Error('Footer Fork Chat wrote to the unowned legacy session key instead of the signed-in account scope.');
  }

  console.log('Studio regression recovery browser gate passed with self-hosted compiler runtime.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/studio-regression-failure.png', fullPage: true }).catch(() => {});
  console.error('Studio regression recovery browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
