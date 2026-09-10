#!/usr/bin/env node
/**
 * The missing synthetic transaction: guided website intake.
 *
 * THE INCIDENT (2026-09-01). "help me build a website for a client who is
 * running a Boutique…" — the platform's #1 real ask — triggered guided intake:
 * the system prompt ordered the model to output NO code, ask ONE question,
 * append <quantora-modal>, and wait. The artifact contract and the client's
 * no-preview enforcement then both punished exactly that reply, so every
 * engine that OBEYED failed ("The model answered in chat without files" →
 * "no healthy AI route"), deterministically, on every attempt.
 *
 * Both deployed golden transactions are specified-tool prompts that demand
 * fenced VFS output, so this whole flow was never a synthetic transaction —
 * the corpus contained only the cases that motivated it (CLAUDE.md: "The
 * corpus cannot only contain the cases that motivated the fix"). This gate
 * adds the flow, deterministically: the mock model COMPLIES with the intake
 * directive, and the platform must reward compliance, not execute it.
 *
 * What only this gate can catch:
 *   1. an intake question flagged as a failed build turn (the incident);
 *   2. a burned retry on a compliant intake reply (the money the user paid
 *      twice for the same right answer);
 *   3. the intake modal not rendering or its answer not flowing into a build
 *      turn that lands the artifact.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const BOUTIQUE_PROMPT = 'help me build a website for a client who is running a Boutique that is into specialized Indian Sarees like Kanjivaram, Uppada, Gadwal, etc. and also selling ready made dresses for all ages. They are also into providing services like Blouse Stitching, Saree Draping, Pico and Fall, Mehndi etc.';

/* Copy the incident produced — none of it may appear on a compliant intake. */
const FAILURE_COPY = /answered in chat without files|Preview cannot run|no healthy AI route|The connection to the model died|did not finish writing files/i;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

let chatCalls = 0;
const guidedFlags = [];

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Intake', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

/* The model OBEYING the FIRST-TURN RULE, verbatim shape: one reflection
 * sentence, one question, a <quantora-modal>, no code fences. */
const compliantIntakeReply = [
  'Love this — a boutique for Kanjivaram, Uppada and Gadwal sarees, ready-made dresses, plus stitching, draping and mehndi services. One thing before I build: what is the boutique called?',
  '',
  '<quantora-modal>',
  '{"question":"What\'s the boutique called?","options":[{"id":"placeholder","title":"Use a placeholder name for now","description":"I\'ll rename it later","value":"Use a placeholder boutique name for now and build the site."},{"id":"type-name","title":"I\'ll type the name in chat","description":"One sec"}]}',
  '</quantora-modal>',
].join('\n');

const boutiqueSiteReply = [
  'Building the boutique site with a placeholder name now.',
  '',
  '```html filepath="index.html"',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Saree Boutique</title>',
  '<style>body{font-family:Georgia,serif;margin:0;background:#fdf6f0;color:#3b2f2f}main{padding:40px}h1{color:#8b1e3f}</style></head>',
  '<body><main><h1 data-testid="boutique-title">The Silk Thread Boutique</h1>',
  '<p>Kanjivaram, Uppada and Gadwal sarees. Blouse stitching, draping, pico and fall, mehndi.</p>',
  '<button type="button" data-testid="boutique-browse" onclick="this.textContent=\'Collection opened\'">Browse the collection</button></main>',
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

  if (path === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { sub: 'guided-intake-user', name: 'Intake User', email: 'intake@quantora.test', picture: null, isAdmin: false },
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
    chatCalls += 1;
    const body = request.postDataJSON?.() || {};
    guidedFlags.push(body.guidedBuild === true);
    const reply = chatCalls === 1 ? compliantIntakeReply
      : chatCalls === 2 ? boutiqueSiteReply
        : boutiqueSiteReply.replace('The Silk Thread Boutique</h1>', 'The Silk Thread Boutique Updated</h1>');
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

async function assistantTranscript() {
  return page.evaluate(() => document.querySelector('.app-shell--studio')?.innerText || document.body.innerText || '');
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill(BOUTIQUE_PROMPT);
  await prompt.press('Enter');

  // 1. The designer's question must render as a question — with its modal.
  const modal = page.locator('[data-quantora-decision-modal="true"]').first();
  await visible(modal, 'Guided intake modal never rendered for the boutique ask.', 25_000);

  // 2. Compliance is rewarded: no failure copy, and no burned retry. Settle
  //    long enough that a client-side auto-retry of the intake turn (the
  //    pre-fix behavior) would have fired its second /api/chat call.
  await page.waitForTimeout(3_000);
  const afterIntake = await assistantTranscript();
  const failureHit = afterIntake.match(FAILURE_COPY);
  if (failureHit) {
    throw new Error(`A compliant intake reply was reported as a failure: "${failureHit[0]}".`);
  }
  if (chatCalls !== 1) {
    throw new Error(`Expected exactly 1 chat call after a compliant intake question; saw ${chatCalls} — a retry burned the user's turn on the right answer.`);
  }
  if (guidedFlags[0] !== true) {
    throw new Error('The boutique ask was not sent as a guided intake turn (guidedBuild flag missing).');
  }

  // 3. The answer flows into a build turn that lands the artifact.
  await page.locator('[data-quantora-decision-option="placeholder"]').click();
  await page.waitForFunction(
    () => /The Silk Thread Boutique|Building the boutique site/i.test(document.body.innerText || ''),
    null,
    { timeout: 25_000 },
  );
  if (chatCalls !== 2) {
    throw new Error(`Expected the modal answer to start exactly one build turn; total chat calls: ${chatCalls}.`);
  }
  const finalTranscript = await assistantTranscript();
  const finalFailure = finalTranscript.match(FAILURE_COPY);
  if (finalFailure) {
    throw new Error(`The build turn after intake was reported as a failure: "${finalFailure[0]}".`);
  }

  // 4. Acknowledging a working build must not call the model or remount it.
  // Use the actual rendered page, not the assistant's claim that files landed.
  async function frameWithHeading(expected, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const heading = await frame.locator('[data-testid="boutique-title"]').textContent({ timeout: 100 }).catch(() => null);
        if (heading === expected) return frame;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(`Preview never rendered the expected fixture heading: ${expected}`);
  }
  const workingFrame = await frameWithHeading('The Silk Thread Boutique');
  await page.waitForTimeout(3_000);
  await workingFrame.locator('[data-testid="boutique-browse"]').evaluate((button) => {
    button.setAttribute('data-ack-sentinel', 'keep-this-working-page');
  });
  for (const acknowledgement of ['Excellent work', 'Thanks!']) {
    const completed = await page.locator('[data-quantora-message-fork="true"]').count();
    await prompt.fill(acknowledgement);
    await prompt.press('Enter');
    // A new completed AI footer proves the send was handled; a disabled send
    // or an ignored message must not pass merely by making no network call.
    await page.waitForFunction((expected) => (
      document.querySelectorAll('[data-quantora-message-fork="true"]').length === expected
    ), completed + 1, { timeout: 10_000 });
    await page.waitForTimeout(1_000);
    if (chatCalls !== 2) throw new Error(`Acknowledgement started an unwanted model/build call: ${acknowledgement}; calls=${chatCalls}`);
    await visible(page.locator('[data-quantora-code-workspace="true"]').first(), 'Acknowledgement closed the working Coding Desk.');
    const sentinel = await workingFrame.locator('[data-testid="boutique-browse"]').getAttribute('data-ack-sentinel').catch(() => null);
    if (sentinel !== 'keep-this-working-page') throw new Error('Acknowledgement replaced or remounted the working preview.');
  }

  // 5. Praise is not a denylist: a real edit in the same message still lands.
  await prompt.fill('Thanks — change the heading to The Silk Thread Boutique Updated');
  await prompt.press('Enter');
  await frameWithHeading('The Silk Thread Boutique Updated');
  if (chatCalls !== 3) throw new Error(`Expected one real refinement after acknowledgements; calls=${chatCalls}`);

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/guided-intake.png', fullPage: true });
  console.log('guided-intake browser gate passed — intake question rendered, no false failure, no burned retry, answer landed a build, acknowledgements preserved Preview, real follow-up edit landed.');
  await browser.close();
  process.exit(0);
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/guided-intake-failure.png', fullPage: true }).catch(() => {});
  console.error('guided-intake browser gate FAILED:', error?.stack || error);
  console.error(`Evidence: chatCalls=${chatCalls}, guidedFlags=${JSON.stringify(guidedFlags)}`);
  await browser.close().catch(() => {});
  process.exit(1);
}
