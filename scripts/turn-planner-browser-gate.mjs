#!/usr/bin/env node
/**
 * PHASE 7, FIRST CUT — the turn planner decides the lane, and its failure modes.
 *
 * Three things, in one browser:
 *  1. A brief the keyword rules misread — "an excel-like tracker … as a web
 *     page people can fill in" reads as an Excel file to them — is planned as
 *     a build: the chat request carries buildMode with the plan, the Office
 *     generator is never called, and Preview renders the page.
 *  2. With the planner endpoint dead (500), a plain build still builds — the
 *     rules are the fallback, and a planner that could take a turn down would
 *     be worse than the regexes it replaces.
 *  3. In a chat pinned to the Coding desk, a plan that names Travel cannot
 *     move it.
 *
 * Mutation notes: with the client ignoring the plan, step 1 fails because the
 * chat request carries no plan and no buildMode; with the pin ignored, step 3
 * fails "jumped to travel".
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const TRACKER_BRIEF = 'I need an excel-like tracker for my association members and their payments, as a web page people can fill in from their phones';
const REFINE_ASK = 'make the header blue';
const CALCULATOR_ASK = 'Build me a simple calculator';
const TRIP_ASK = 'help me plan a trip with hotels and flights';

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Planner', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const siteReply = (testId) => [
  'Done — here it is.',
  '',
  '```jsx',
  `import React from 'react';\nexport default function App(){ return <main style={{padding:24}}><h1 data-testid='${testId}'>Ready</h1></main>}`,
  '```',
].join('\n');

let plannerMode = 'answer';
const chatRequests = [];
const officeRequests = [];

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
  localStorage.removeItem('quantora_active_specialist_domain');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/api/auth/session') {
    return json(200, { user: { sub: 'planner-user', name: 'Planner User', email: 'planner@quantora.test', picture: null, isAdmin: false } });
  }
  if (path === '/api/models') {
    return json(200, { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] });
  }
  if (path === '/api/plan-turn') {
    if (plannerMode === 'down') return json(500, { error: 'planner down' });
    const message = String(request.postDataJSON?.()?.message || '');
    if (message.includes('excel-like tracker')) {
      return json(200, { plan: { lane: 'build', desk: 'coding', officeKind: null, buildMode: true, confidence: 0.95, reason: 'a web page to fill in', source: 'planner', agreed: false } });
    }
    if (/trip/i.test(message)) {
      return json(200, { plan: { lane: 'advisor', desk: 'travel', officeKind: null, buildMode: false, confidence: 0.99, reason: 'a trip', source: 'planner', agreed: true } });
    }
    return json(200, { plan: { lane: 'chat', desk: null, officeKind: null, buildMode: false, confidence: 0.8, reason: 'chat', source: 'planner', agreed: true } });
  }
  if (path === '/api/generate-office') {
    officeRequests.push(request.postDataJSON?.() || {});
    return json(200, { error: 'the Office generator must not run in this gate' });
  }
  if (path === '/api/preview-compile') {
    const body = request.postDataJSON?.() || {};
    try {
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      return json(200, compiled);
    } catch (error) {
      return json(422, { error: error?.message || 'Preview compilation failed.' });
    }
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    chatRequests.push(body);
    const message = String(body.message || '');
    const reply = message.includes('excel-like tracker')
      ? siteReply('tracker-page')
      : /calculator/i.test(message)
        ? siteReply('calculator-display')
        : 'Noted — still here on the same desk.';
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(reply) });
  }
  return json(200, { projects: [], sessions: [], ok: true });
});

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function visibleFrame(selector, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const hit = frame.locator(selector).first();
      if (await hit.isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

const domainNow = () => page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
const lastChatRequest = () => chatRequests[chatRequests.length - 1] || {};

try {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await enterSignedInStudio(page);
  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  const newChat = page.getByRole('button', { name: /New Chat/i }).first();

  // 1. The planner's build lane beats the keyword rules' Excel reading.
  await newChat.click();
  await page.waitForTimeout(300);
  await prompt.fill(TRACKER_BRIEF);
  await prompt.press('Enter');
  await page.getByText(TRACKER_BRIEF.slice(0, 40), { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  if (!(await visibleFrame('[data-testid="tracker-page"]', 20_000))) {
    throw new Error(`The planned build never rendered. Chat requests: ${chatRequests.length}, office requests: ${officeRequests.length}, last chat body keys: ${Object.keys(lastChatRequest()).join(',')}`);
  }
  const planned = lastChatRequest();
  if (planned.lanePlan?.lane !== 'build' || planned.lanePlan?.source !== 'planner') {
    throw new Error(`The chat request did not carry the planner's build lane: ${JSON.stringify(planned.lanePlan || null)}`);
  }
  if (planned.buildMode !== true) throw new Error('The planned build was not sent as a build turn (buildMode false).');
  if (officeRequests.length) throw new Error('The Office generator was called for a web-page brief.');
  if (await page.getByText(/Architecting EXCEL document/i).count()) throw new Error('The desk announced an Excel document for a web-page brief.');

  // 2. A dead planner never takes a turn down: the rules still build.
  plannerMode = 'down';
  await newChat.click();
  await page.waitForTimeout(300);
  await prompt.fill(CALCULATOR_ASK);
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  if (!(await visibleFrame('[data-testid="calculator-display"]', 20_000))) throw new Error('With the planner down, a plain build did not build.');
  const fallback = lastChatRequest();
  if (fallback.lanePlan !== null && fallback.lanePlan !== undefined) throw new Error(`A dead planner still produced a plan: ${JSON.stringify(fallback.lanePlan)}`);
  if (fallback.buildMode !== true) throw new Error('With the planner down, the build was not sent as a build turn.');
  plannerMode = 'answer';

  /*
   * 2b. A REFINE IS NOT A REPAIR — asserted on the WIRE, because that is the
   * only place it was ever wrong (2026-09-08).
   *
   * The client used to send `qualityHints.repair: refineDesk`, true on EVERY
   * refine. The server re-resolves the route (the client sends `id: 'auto'`,
   * so select-models re-runs resolveCodingDeskModel), and there `repair` hits
   * the escalation on the line straight after the small-refine check — so
   * "make the header blue" reached the paid flagship and its slow attempt ate
   * the turn budget that recovery needed.
   *
   * Every unit test missed it. The rule lives in shared/, the defect lived in
   * the REQUEST BODY, and nothing asserted the body. Restoring the bad line
   * still passes `npm run test:all` today; only this check sees it.
   *
   * A genuine repair is unaffected: chat-handler derives repair as
   * `qualityHints.repair === true || task === "repair"`, and api/_lib/repair.ts
   * sends that task.
   */
  const chatCountBeforeRefine = chatRequests.length;
  await prompt.fill(REFINE_ASK);
  await prompt.press('Enter');
  await page.getByText(REFINE_ASK.slice(0, 24), { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(900);
  if (chatRequests.length === chatCountBeforeRefine) {
    throw new Error('The refine never reached /api/chat, so nothing could be asserted about it.');
  }
  const refined = lastChatRequest();
  if (refined.refineMode !== true) {
    throw new Error(`A follow-up on a built desk was not sent as a refine (refineMode ${JSON.stringify(refined.refineMode)}).`);
  }
  if (refined.qualityHints && refined.qualityHints.repair === true) {
    throw new Error('An ordinary refine was sent as a repair (qualityHints.repair true). That escalates every small edit to the paid flagship and spends the budget a fallback needs.');
  }

  // 3. A plan that names Travel cannot move a chat pinned to the Coding desk.
  const codingPlus = page.locator('[data-quantora-workspace-new-chat="coding"]').first();
  await visible(codingPlus, 'The "+" beside the Coding desk is missing.');
  await codingPlus.click();
  await page.waitForTimeout(300);
  await prompt.fill(TRIP_ASK);
  await prompt.press('Enter');
  await page.getByText(TRIP_ASK, { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(700);
  const domain = await domainNow();
  if (['finance', 'travel', 'education', 'research'].includes(domain)) throw new Error(`A pinned coding chat jumped to ${domain} on the planner's word.`);
  const pinnedRequest = lastChatRequest();
  if (pinnedRequest.studioDomainPinned !== true) throw new Error('The pinned chat did not tell the server it was pinned.');
  if (pinnedRequest.studioDomain) throw new Error(`The pinned coding chat asked the server for the ${pinnedRequest.studioDomain} desk.`);

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/turn-planner-pass.png', fullPage: true }).catch(() => {});
  console.log('Turn planner browser gate passed: the plan decided the lane, a dead planner changed nothing, and a pin held.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/turn-planner-failure.png', fullPage: true }).catch(() => {});
  console.error('Turn planner browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
