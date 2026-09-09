#!/usr/bin/env node
/**
 * Coding Desk is the product. A build ask with the desk open must land FILES,
 * never terminate as "Answered in chat. There is no runnable preview yet."
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const BUILD_PROMPT = 'build a Google Drive crawling / organize agent for macOS';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

let sawBuildMode = false;
let chatCalls = 0;
let nextReply = null;
let exhaustNextAttempt = false;
const traceEvents = [];

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Desk Files', latencyMs: 18, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const chatOnlyPlan = [
  'Here is a plan for your macOS Google Drive organize agent:',
  '',
  '1. Authenticate with Google OAuth',
  '2. Crawl folders with the Drive API',
  '3. Classify and move files by rules',
  '',
  'I can implement this in Swift next if you want.',
].join('\n');

const agentPreviewReply = [
  'Built a browser dashboard for the Drive organize agent.',
  '',
  '```html filepath="index.html"',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Drive Organize Agent</title>',
  '<style>body{font-family:system-ui;margin:0;background:#0f172a;color:#e2e8f0}main{padding:32px}button{padding:10px 14px}</style></head>',
  '<body><main><h1 data-testid="drive-agent-title">Drive Organize Agent</h1>',
  '<p>Crawl, classify, and tidy Google Drive from this Coding Desk preview.</p>',
  '<button type="button" data-testid="drive-agent-run">Run organize pass</button>',
  '<p id="status" role="status">Ready</p></main>',
  '<script>document.querySelector("[data-testid=drive-agent-run]")?.addEventListener("click",()=>{document.getElementById("status").textContent="Pass complete";});</script>',
  '</body></html>',
  '```',
].join('\n');

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (path === '/api/trace') {
    traceEvents.push(request.postDataJSON());
    return route.fulfill({ status: 202, contentType: 'application/json', body: '{"recorded":true}' });
  }

  if (path === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { sub: 'desk-files-user', name: 'Desk User', email: 'desk@quantora.test', picture: null, isAdmin: false },
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
    chatCalls += 1;
    if (exhaustNextAttempt) {
      exhaustNextAttempt = false;
      // Advance only the wall clock used by the budget; no real three-minute
      // provider call and no changes to timer scheduling.
      await page.evaluate(() => {
        const realNow = Date.now.bind(Date);
        Date.now = () => realNow() + 176000;
      });
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: [
        `data: ${JSON.stringify({ error: { code: 'INFERENCE_ATTEMPT_TIMEOUT', message: 'Injected provider timeout', retryable: true } })}`,
        'data: [DONE]', '',
      ].join('\n\n') });
    }
    const body = request.postDataJSON?.() || {};
    if (body.buildMode === true) sawBuildMode = true;
    const reply = nextReply || (chatCalls === 1 ? chatOnlyPlan : agentPreviewReply);
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(reply),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  await visible(page.locator('[data-quantora-code-workspace="true"]').first(), 'Coding desk did not open before the build ask.');

  const emptyFiles = page.locator('[data-quantora-file-tree="true"]').getByText('No files yet. Ask me to build something.');
  await visible(emptyFiles, 'Expected an empty FILES pane before the build.');

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill(BUILD_PROMPT);
  await prompt.press('Enter');

  await page.waitForFunction(() => {
    const tree = document.querySelector('[data-quantora-file-tree="true"]');
    if (!tree) return false;
    return !/No files yet\. Ask me to build something\./.test(tree.textContent || '');
  }, null, { timeout: 25_000 }).catch(() => {});

  if (await emptyFiles.isVisible().catch(() => false)) {
    throw new Error('FILES stayed empty after a Coding Desk build ask.');
  }

  const fileHit = page.locator('[data-quantora-file-tree="true"]').getByText(/index\.html|App\.jsx|main\.jsx/i).first();
  await visible(fileHit, 'Coding Desk build did not show at least one source file in FILES.', 20_000);

  if (!sawBuildMode) {
    throw new Error('Client never sent buildMode:true for the Drive agent build ask.');
  }
  if (chatCalls < 2) {
    throw new Error(`Expected a self-heal rebuild after chat-only plan; saw ${chatCalls} chat call(s).`);
  }

  const partner = page.locator('[data-quantora-partner-status="true"]').first();
  if (await partner.isVisible().catch(() => false)) {
    const partnerText = (await partner.innerText()).trim();
    if (/Answered in chat\. There is no runnable preview yet/i.test(partnerText)) {
      throw new Error(`Partner status treated chat-only as finished: ${partnerText}`);
    }
  }

  await page.locator('button[title="Stop generating"]').waitFor({ state: 'hidden', timeout: 25000 });
  let previousHeading = 'Drive Organize Agent';
  for (let edit = 1; edit <= 10; edit += 1) {
    const heading = `Drive Workspace Revision ${edit}`;
    nextReply = `\`\`\`html filepath="index.html"\n<<<<\n<h1 data-testid="drive-agent-title">${previousHeading}</h1>\n====\n<h1 data-testid="drive-agent-title">${heading}</h1>\n>>>>\n\`\`\``;
    const before = chatCalls;
    await prompt.fill(`Change only the main heading to ${heading}; preserve the existing application.`);
    await Promise.all([
      page.waitForResponse((res) => new URL(res.url()).pathname === '/api/chat'),
      prompt.press('Enter'),
    ]);
    await page.locator('button[title="Stop generating"]').waitFor({ state: 'hidden', timeout: 25000 });
    if (chatCalls !== before + 1) throw new Error(`Edit ${edit} burned ${chatCalls - before} model calls for a valid targeted patch`);
    const deadline = Date.now() + 15000;
    let found = false;
    while (Date.now() < deadline && !found) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        if (await frame.locator('[data-testid="drive-agent-title"]').filter({ hasText: heading }).count().catch(() => 0)) found = true;
      }
      if (!found) await page.waitForTimeout(100);
    }
    if (!found) throw new Error(`Edit ${edit} did not reach the running preview`);
    previousHeading = heading;
  }
  if (!traceEvents.some((event) => event.boundary === 'browser.turn-recovery')) {
    throw new Error('The initial automatic repair left no diagnostic event');
  }
  if (traceEvents.filter((event) => event.detailCode === 'artifact-accepted').length < 10) {
    throw new Error('Repeated edit acceptance was not recorded in the trace');
  }
  const beforeFailure = chatCalls;
  exhaustNextAttempt = true;
  await prompt.fill('Change the heading again, keeping the application intact.');
  await Promise.all([
    page.waitForResponse((res) => new URL(res.url()).pathname === '/api/chat'),
    prompt.press('Enter'),
  ]);
  await page.locator('button[title="Stop generating"]').waitFor({ state: 'hidden', timeout: 25000 });
  await page.waitForTimeout(300);
  if (chatCalls !== beforeFailure + 1) throw new Error('A timed-out turn started an unaffordable retry');
  if (traceEvents.some((event) => event.detailCode === 'silent-turn')) throw new Error('An explicit provider failure was lost as a silent turn');
  if (!traceEvents.some((event) => event.boundary === 'browser.turn-recovery' && event.state === 'skipped')) throw new Error('Recovery exhaustion left no reason in the trace');
  if (!traceEvents.some((event) => event.detailCode === 'INFERENCE_ATTEMPT_TIMEOUT')) throw new Error('The provider timeout diagnosis was lost');
  const transcript = await page.locator('[data-quantora-assistant-prose="true"]').last().innerText();
  if (!transcript.trim() || /ended without a reply/.test(transcript)) throw new Error('Provider failure has no useful terminal response');

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/coding-desk-must-write-files.png', fullPage: true });
  console.log('coding-desk-must-write-files browser gate passed');
  await browser.close();
  process.exit(0);
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/coding-desk-must-write-files-failure.png', fullPage: true }).catch(() => {});
  console.error(error?.stack || error);
  await browser.close().catch(() => {});
  process.exit(1);
}
