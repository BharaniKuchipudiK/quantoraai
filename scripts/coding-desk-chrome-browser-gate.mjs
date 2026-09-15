#!/usr/bin/env node
/**
 * Coding Desk chrome smoke: Publish + Canvas + resizable splits + durable Run controls.
 * Boutique→calculator stock-photo bleed is covered by unit tests in
 * studio-preview-helpers.test.js (CI typecheck job).
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
mkdirSync('artifacts/e2e', { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const qirSignals = [];

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Desk Chrome', latencyMs: 18, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const calculatorReply = [
  'Built a calculator.',
  '',
  '```html filepath="index.html"',
  '<!DOCTYPE html><html><body><main><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></main></body></html>',
  '```',
].join('\n');

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
  localStorage.removeItem('quantora_studio_chat_width_pct');
  localStorage.removeItem('quantora_desk_files_width_px');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { sub: 'desk-chrome-user', name: 'Desk User', email: 'desk@quantora.test', picture: null, isAdmin: false },
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
  if (path === '/api/qir-runs' && request.method() === 'POST') {
    const body = request.postDataJSON?.() || {};
    if (['coding.pause', 'coding.resume', 'coding.cancel'].includes(body.action)) {
      qirSignals.push(body);
      const status = body.action === 'coding.pause'
        ? 'PAUSED'
        : body.action === 'coding.resume'
          ? 'EXECUTING'
          : 'FAILED_TERMINAL';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          run: { runId: body.runId, status },
          durability: 'persisted',
          continuation: body.action === 'coding.resume' ? { action: 'continue' } : null,
        }),
      });
    }
  }
  if (path === '/api/preview-compile') {
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
  if (path === '/api/chat') {
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(calculatorReply),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 12_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  const desk = page.locator('[data-quantora-code-workspace="true"]').first();
  await visible(desk, 'Coding desk did not open.');

  await visible(page.locator('[data-quantora-chat-desk-split="true"]').first(), 'Chat | desk resize handle missing.');
  await visible(page.locator('[data-quantora-files-preview-split="true"]').first(), 'Files | Preview resize handle missing.');

  // The enclosing Desk is the existing authoritative browser projection of the
  // durable run. Inject one active snapshot and prove the rail sends the three
  // real workflow signals for that exact identity.
  const controlRunId = 'browser-pilot-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await page.waitForTimeout(100);
  await desk.evaluate((node, runId) => {
    node.setAttribute('data-quantora-qir-run-id', runId);
    node.setAttribute('data-quantora-qir-run-status', 'EXECUTING');
  }, controlRunId);

  const pauseRun = page.locator('[data-quantora-qir-control="pause"]').first();
  const cancelRun = page.locator('[data-quantora-qir-control="cancel"]').first();
  await visible(pauseRun, 'Pause control missing for an executing durable run.');
  await visible(cancelRun, 'Cancel control missing for an executing durable run.');
  await pauseRun.click();
  const resumeRun = page.locator('[data-quantora-qir-control="resume"]').first();
  await visible(resumeRun, 'Resume control did not replace Pause after durable pause acknowledgement.');
  if ((await page.locator('[data-quantora-qir-control-status]').first().getAttribute('data-quantora-qir-control-status')) !== 'PAUSED') {
    throw new Error('Durable pause acknowledgement was not reflected in the rail.');
  }
  await resumeRun.click();
  await visible(pauseRun, 'Pause control did not return after durable resume acknowledgement.');
  page.once('dialog', (dialog) => dialog.accept());
  await cancelRun.click();
  await page.locator('[data-quantora-qir-controls="true"]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  if (await page.locator('[data-quantora-qir-controls="true"]').count()) {
    throw new Error('Terminal cancelled Run still exposes live run controls.');
  }
  const signalNames = qirSignals.map((entry) => entry.action).join(',');
  if (signalNames !== 'coding.pause,coding.resume,coding.cancel') {
    throw new Error(`Durable run controls sent the wrong signal sequence: ${signalNames || 'none'}.`);
  }
  if (qirSignals.some((entry) => entry.runId !== controlRunId)) {
    throw new Error('A durable run control changed the active run identity.');
  }

  await desk.evaluate((node) => {
    node.removeAttribute('data-quantora-qir-run-id');
    node.removeAttribute('data-quantora-qir-run-status');
  });

  const prompt = page.locator('textarea').first();
  await visible(prompt, 'Studio prompt is missing.');
  await prompt.fill('Build me a simple calculator');
  await page.keyboard.press('Enter');

  await page.waitForFunction(() => {
    const tree = document.querySelector('[data-quantora-file-tree="true"]')?.innerText || '';
    return /index\.html/i.test(tree);
  }, null, { timeout: 20_000 });

  await visible(page.locator('[data-quantora-desk-publish="true"]').first(), 'Publish control missing from Coding desk chrome.');
  await page.locator('[data-quantora-desk-publish="true"]').first().click();
  await visible(page.locator('[data-quantora-desk-publish-menu="true"]').first(), 'Publish dropdown did not open.');
  await visible(page.locator('[data-quantora-desk-publish-menu="true"] button', { hasText: /Share link/i }).first(), 'Share link missing from Publish menu.');
  await visible(page.locator('[data-quantora-desk-publish-menu="true"] button', { hasText: /Publish to Vercel/i }).first(), 'Publish to Vercel missing from Publish menu.');
  await page.locator('[data-quantora-desk-publish="true"]').first().click();

  const handle = page.locator('[data-quantora-chat-desk-split="true"]').first();
  const before = await handle.boundingBox();
  if (!before) throw new Error('Could not measure chat|desk split handle.');
  await page.mouse.move(before.x + before.width / 2, before.y + 40);
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y + 40, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const stored = await page.evaluate(() => localStorage.getItem('quantora_studio_chat_width_pct'));
  if (!stored) throw new Error('Chat width was not persisted to localStorage.');

  const canvasBtn = page.locator('[data-quantora-desk-canvas="true"]').first();
  await visible(canvasBtn, 'Canvas control missing from Coding desk chrome.');
  await canvasBtn.click();
  await visible(page.locator('[data-quantora-canvas-root="true"]').first(), 'Canvas overlay did not open.');
  await page.locator('[data-quantora-canvas-root="true"] button[title="Close preview (Esc)"]').first().click();

  await page.screenshot({ path: 'artifacts/e2e/coding-desk-chrome.png', fullPage: true });
  console.log('coding-desk-chrome browser gate passed');
  await browser.close();
  process.exit(0);
} catch (error) {
  console.error(error);
  await page.screenshot({ path: 'artifacts/e2e/coding-desk-chrome-failure.png', fullPage: true }).catch(() => {});
  await browser.close();
  process.exit(1);
}
