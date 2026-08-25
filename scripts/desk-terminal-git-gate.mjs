#!/usr/bin/env node
/**
 * Coding Desk scorecard: Terminal `ls` + in-memory desk `git commit` must
 * operate on the same VFS Preview is running (deskShellVfs / proveDeskFilesMatchPreview).
 *
 * Modes:
 * - Local / CI (default): Vite preview at /desk, mocked chat + in-process preview-compile.
 * - Deployed: QUANTORA_E2E_BASE_URL=https://… + VERCEL_AUTOMATION_BYPASS_SECRET
 *   hits production-shaped `/desk` (COEP). Auth + chat + preview-compile are
 *   deterministic (synthetic VFS); the deployed proof is COEP /desk + Terminal/Git
 *   UI against that tree. Full signed-in live LLM on /desk stays a manual
 *   checklist — see docs/DESK_TERMINAL_GIT_PROD_CHECKLIST.md.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { listingShowsGeneratedProjectFile } from '../src/lib/studio-workspace-tree.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const COMMIT_MESSAGE = 'Save the Preview tree from Terminal/Git gate';
/** Fixture paths the chat reply writes — Terminal ls + Git must list all of them. */
const EXPECTED_PROJECT_PATHS = Object.freeze([
  'index.html',
  'package.json',
  'src/App.jsx',
  'src/main.jsx',
  'src/index.css',
]);

const PROJECT_REPLY = [
  'Done — here is a small desk project for Terminal and Git.',
  '',
  '```json filepath="package.json"',
  JSON.stringify({
    name: 'desk-terminal-git-gate',
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
  "export default function App(){return <main data-testid='desk-git-app'><h1>Desk Terminal Git</h1><p>Same tree Preview runs.</p></main>}",
  '```',
  '',
  '```css filepath="src/index.css"',
  'body{margin:0;font-family:system-ui;background:#111827;color:#fff}main{padding:48px}',
  '```',
].join('\n');

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Desk Terminal Git', latencyMs: 14, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

function resolveTarget() {
  const baseUrl = String(process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
  const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
  const canary = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
  const requireDeployed = process.env.QUANTORA_DESK_TGIT_REQUIRE_DEPLOYED === '1'
    || process.argv.includes('--deployed');

  if (requireDeployed) {
    if (!/^https:\/\//.test(baseUrl)) {
      throw new Error('Deployed desk Terminal/Git gate requires QUANTORA_E2E_BASE_URL as an HTTPS deployment URL.');
    }
    if (bypass.length < 24) {
      throw new Error(
        'Deployed desk Terminal/Git gate requires VERCEL_AUTOMATION_BYPASS_SECRET. '
        + 'Without it, https://quantoraai.app/desk returns 403 (Vercel SSO / protection).',
      );
    }
  }

  const isHttps = /^https:\/\//.test(baseUrl);
  const canHitDeployed = isHttps && bypass.length >= 24;
  if (isHttps && !canHitDeployed && !requireDeployed) {
    throw new Error(
      'HTTPS QUANTORA_E2E_BASE_URL set without VERCEL_AUTOMATION_BYPASS_SECRET. '
      + 'Use a local Vite URL, or provide the bypass to hit deployed /desk.',
    );
  }

  return {
    mode: canHitDeployed ? 'deployed-desk' : 'local-desk',
    baseUrl,
    deskUrl: `${baseUrl}/desk`,
    note: canHitDeployed
      ? `Hitting deployed COEP /desk at ${baseUrl}/desk (bypass + synthetic auth/chat/compile for deterministic VFS).`
      : `Hitting local /desk at ${baseUrl}/desk (mocked APIs).`,
    bypass,
    canary,
    prodDeskBlocker:
      'https://quantoraai.app/desk returns 403 without VERCEL_AUTOMATION_BYPASS_SECRET '
      + '(Vercel deployment protection / SSO). This gate uses the same bypass pattern as '
      + 'deployed goldens when secrets are present.',
  };
}

async function visible(locator, message, timeout = 12_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function hidden(locator, message, timeout = 5_000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

function listingMissingExpectedPaths(listing = '', expected = EXPECTED_PROJECT_PATHS) {
  const text = String(listing || '');
  return expected.filter((path) => !text.includes(path));
}

function assertListingHasFixtureTree(listing, label) {
  const missing = listingMissingExpectedPaths(listing);
  if (missing.length) {
    throw new Error(`${label} missing fixture paths [${missing.join(', ')}]. Saw: ${String(listing).slice(0, 400)}`);
  }
  if (!listingShowsGeneratedProjectFile(listing)) {
    throw new Error(`${label} did not list generated project files. Saw: ${String(listing).slice(0, 400)}`);
  }
}

/** Preview wrapper can be visible while compiling or errored — wait for a live iframe. */
async function waitForRunningPreview(page, timeout = 25_000) {
  const preview = page.locator('[data-quantora-real-project-preview="true"]').first();
  await visible(preview, 'Multi-file project never reached real Preview.', timeout);

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const previewError = await preview.getAttribute('data-quantora-preview-error').catch(() => null);
    if (previewError) {
      throw new Error(`Preview failed before Terminal/Git proof: ${previewError}`);
    }
    if (await page.locator('[data-quantora-preview-error="true"]').first().isVisible().catch(() => false)) {
      const text = await page.locator('[data-quantora-preview-error="true"]').first().innerText().catch(() => '');
      throw new Error(`Preview error banner before Terminal/Git proof: ${text.slice(0, 240)}`);
    }
    const loading = await page.locator('[data-quantora-preview-loading="true"]').first().isVisible().catch(() => false);
    const correlationId = await preview.getAttribute('data-quantora-correlation-id').catch(() => null);
    let appVisible = false;
    for (const frame of page.frames()) {
      if (await frame.locator('[data-testid="desk-git-app"]').first().isVisible().catch(() => false)) {
        appVisible = true;
        break;
      }
    }
    if (!loading && correlationId && appVisible) return { correlationId };
    await page.waitForTimeout(200);
  }
  throw new Error('Preview never finished rendering the fixture app (iframe / desk-git-app).');
}

/** Terminal ls and Git status/commit must list the same files Preview is running. */
export async function proveDeskFilesMatchPreview(page, job = 'desk') {
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
  await page.waitForFunction((paths) => {
    const panel = document.querySelector('[data-quantora-studio-terminal="true"]')?.innerText || '';
    const text = document.querySelector('[data-quantora-studio-terminal-log="true"]')?.innerText || '';
    return paths.every((path) => text.includes(path)) && !/running…/.test(panel);
  }, EXPECTED_PROJECT_PATHS, { timeout: 8_000 }).catch(() => {});
  const lsText = await page.locator('[data-quantora-studio-terminal-log="true"]').first().innerText().catch(() => '');
  assertListingHasFixtureTree(lsText || terminalText, `${job}: Terminal ls`);

  await page.locator('[data-quantora-studio-git-nav="true"]').click();
  await visible(page.locator('[data-quantora-studio-git="true"]').first(), `${job}: Git panel did not open.`);
  await visible(page.locator('[data-quantora-studio-git-status="true"]').first(), `${job}: Git status control is missing.`);
  await hidden(page.locator('[data-quantora-monaco="true"]').first(), `${job}: Git tab still showed the file editor.`);
  const gitPanel = page.locator('[data-quantora-studio-git="true"]').first();
  if (/No files in this desk yet|cannot start on this page/i.test(await gitPanel.innerText())) {
    throw new Error(`${job}: Preview is running but Git said it cannot use those files.`);
  }
  await page.waitForFunction((paths) => {
    const text = document.querySelector('[data-quantora-studio-git-log="true"]')?.innerText || '';
    return paths.every((path) => text.includes(path));
  }, EXPECTED_PROJECT_PATHS, { timeout: 8_000 }).catch(() => {});
  if (listingMissingExpectedPaths(await page.locator('[data-quantora-studio-git-log="true"]').first().innerText().catch(() => '')).length) {
    await page.locator('[data-quantora-studio-git-status="true"]').first().click();
    await page.waitForFunction((paths) => {
      const text = document.querySelector('[data-quantora-studio-git-log="true"]')?.innerText || '';
      return paths.every((path) => text.includes(path));
    }, EXPECTED_PROJECT_PATHS, { timeout: 8_000 }).catch(() => {});
  }
  const gitLog = await page.locator('[data-quantora-studio-git-log="true"]').first().innerText().catch(() => '');
  assertListingHasFixtureTree(gitLog, `${job}: Git status`);

  const message = page.locator('[data-quantora-studio-git-message="true"]').first();
  await visible(message, `${job}: Git commit message input is missing.`);
  await message.fill(COMMIT_MESSAGE);
  await page.locator('[data-quantora-studio-git-commit="true"]').first().click();
  await page.waitForFunction((payload) => {
    const panel = document.querySelector('[data-quantora-studio-git="true"]')?.innerText || '';
    const text = document.querySelector('[data-quantora-studio-git-log="true"]')?.innerText || '';
    return text.includes(payload.message)
      && payload.paths.every((path) => text.includes(path))
      && !/running…/.test(panel);
  }, { message: COMMIT_MESSAGE, paths: EXPECTED_PROJECT_PATHS }, { timeout: 8_000 }).catch(() => {});
  const commitLog = await page.locator('[data-quantora-studio-git-log="true"]').first().innerText().catch(() => '');
  if (!commitLog.includes(COMMIT_MESSAGE)) {
    throw new Error(`${job}: Git commit did not record the message. Saw: ${String(commitLog).slice(0, 400)}`);
  }
  assertListingHasFixtureTree(commitLog, `${job}: Git commit`);

  return { lsText, gitLog, commitLog };
}

export async function runDeskTerminalGitGate({ requireDeployed = false } = {}) {
  if (requireDeployed) process.env.QUANTORA_DESK_TGIT_REQUIRE_DEPLOYED = '1';

  const target = resolveTarget();
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const evidence = {
    startedAt: new Date().toISOString(),
    mode: target.mode,
    note: target.note,
    baseUrl: target.baseUrl,
    deskUrl: target.deskUrl,
    deploymentSha: process.env.QUANTORA_DEPLOYMENT_SHA || null,
    prodDeskBlocker: target.prodDeskBlocker,
    commitMessage: COMMIT_MESSAGE,
  };

  const browser = await chromium.launch({ headless: true });
  const started = Date.now();
  try {
    const contextOptions = { viewport: { width: 1600, height: 1000 } };
    const context = await browser.newContext(contextOptions);

    if (target.mode === 'deployed-desk') {
      const origin = new URL(target.baseUrl).origin;
      const browserBypassHeaders = {
        'x-vercel-protection-bypass': target.bypass,
        'x-vercel-set-bypass-cookie': 'samesitenone',
      };
      if (target.canary.length >= 24) {
        browserBypassHeaders['X-Quantora-Golden-Canary'] = target.canary;
      }
      await context.route('**/*', (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== origin) return route.continue();
        return route.continue({
          headers: {
            ...request.headers(),
            ...browserBypassHeaders,
          },
        });
      });
    }

    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('quantora_hide_welcome', 'true');
      localStorage.removeItem('quantora_profile_avatar_v1');
    });

    // Deterministic VFS: mock auth + chat (+ models). Preview-compile stays real
    // so the desk mounts the same compiled tree Preview would serve.
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path === '/api/auth/session') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              sub: 'desk-terminal-git-canary',
              name: 'Desk Terminal Git',
              email: 'desk-terminal-git@quantora.invalid',
              picture: null,
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
          body: sseBody(PROJECT_REPLY),
        });
      }
      if (path === '/api/preview-compile') {
        // Deterministic compile in both modes so the gate proves Terminal/Git on
        // COEP /desk without depending on live preview-compile auth/quota.
        const body = request.postDataJSON?.() || {};
        try {
          const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
        } catch (error) {
          return route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ error: error?.errors?.[0]?.text || error?.message || 'Preview compilation failed.' }),
          });
        }
      }
      if (target.mode === 'deployed-desk') {
        return route.continue();
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [], sessions: [], ok: true }),
      });
    });

    await page.goto(target.deskUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // If protection bounced us off /desk, fall back through Enter Portal.
    if (!/\/desk\/?(\?|$)/.test(page.url())) {
      await page.goto(target.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
    await enterSignedInStudio(page);

    const isolation = await page.evaluate(() => ({
      path: window.location.pathname,
      isolated: window.crossOriginIsolated === true,
    }));
    assert.match(isolation.path, /\/desk\/?$/, `expected /desk, got ${isolation.path || '(none)'}`);
    assert.equal(isolation.isolated, true, 'Coding desk must be cross-origin isolated (COEP) for Terminal and Git');

    await page.locator('[data-quantora-coding-desk-nav="true"]').click().catch(() => {});
    await visible(page.locator('[data-quantora-code-workspace="true"]').first(), 'Coding desk workspace did not open.', 15_000);

    const prompt = page.locator('.app-shell--studio textarea').first();
    await visible(prompt, 'Studio prompt input is missing.');
    await prompt.fill('build a small mission control interface so Terminal and Git can see the files');
    await prompt.press('Enter');

    const running = await waitForRunningPreview(page, 25_000);

    const fileHit = page.locator('[data-quantora-file-tree="true"]').getByText(/index\.html|App\.jsx|main\.jsx/i).first();
    await visible(fileHit, 'FILES pane did not list Preview project files.', 20_000);
    for (const path of EXPECTED_PROJECT_PATHS) {
      await visible(
        page.locator('[data-quantora-file-tree="true"]').getByText(path, { exact: false }).first(),
        `FILES pane missing fixture path ${path}.`,
        8_000,
      );
    }

    const proof = await proveDeskFilesMatchPreview(page, 'terminal-git');

    const durationMs = Date.now() - started;
    evidence.ok = true;
    evidence.completedAt = new Date().toISOString();
    evidence.durationMs = durationMs;
    evidence.isolated = isolation.isolated;
    evidence.path = isolation.path;
    evidence.correlationId = running.correlationId;
    evidence.expectedPaths = EXPECTED_PROJECT_PATHS;
    evidence.lsSnippet = String(proof.lsText || '').slice(0, 240);
    evidence.commitSnippet = String(proof.commitLog || '').slice(0, 240);
    writeFileSync(`${ARTIFACT_DIR}/desk-terminal-git-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    await page.screenshot({ path: `${ARTIFACT_DIR}/desk-terminal-git.png`, fullPage: true }).catch(() => {});

    console.log(
      `Desk Terminal/Git gate passed in ${durationMs}ms (mode=${target.mode}, isolated=${isolation.isolated}) — `
      + `ls listed Preview files and commit recorded "${COMMIT_MESSAGE}".`,
    );
    console.log(target.note);
    await context.close();
    return evidence;
  } catch (error) {
    evidence.ok = false;
    evidence.failedAt = new Date().toISOString();
    evidence.error = error?.message || String(error);
    writeFileSync(`${ARTIFACT_DIR}/desk-terminal-git-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runDeskTerminalGitGate({
    requireDeployed: process.argv.includes('--deployed'),
  }).catch((error) => {
    console.error('Desk Terminal/Git gate FAILED:', error?.stack || error);
    process.exitCode = 1;
  });
}
