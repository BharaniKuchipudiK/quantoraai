#!/usr/bin/env node
/*
 * REWIND: take the desk back to a version that existed, exactly.
 *
 * Phase 7 pairs candidate patches with ROLLBACK, and when candidate-patch.js
 * was written the argument for not building a second inverse was that the desk
 * already has one: every accepted commit records a checkpoint, and rewind
 * restores a whole verified tree. That argument was made in a PR description
 * and held up by unit tests. Nothing had ever opened the menu.
 *
 * `desk-rewind` has sat at "helpers only" in the ledger since it shipped --
 * desk-checkpoints, desk-checkpoint-delta and desk-checkpoint-client are all
 * tested, and the control none of them touches is the one a person clicks. This
 * gate is the missing half of that claim: rollback is delivered, and here is
 * the proof from the outside.
 *
 * WHAT IT PROVES
 *
 *   1. Two builds leave two checkpoints, and the menu lists them.
 *   2. The checkpoint the desk is ALREADY on is offered as unrestorable. A
 *      rewind to where you already are is a no-op that looks like a broken
 *      button, and it is the one entry that must never invite a click.
 *   3. Restoring an earlier checkpoint brings back THAT tree -- named content
 *      from the first build, not merely "something older".
 *   4. The desk says what the rewind changed, rather than swapping the files
 *      underneath the person in silence.
 *
 * Step 3 is the whole point and is asserted on the rendered Preview, not on
 * internal state: a rewind that updates a variable and leaves the running page
 * alone is the failure this journey hides, and it is invisible from inside.
 *
 * The verdict is the last line: DESK REWIND | passed … or
 * DESK REWIND | FAILED at <step> | <why> | <state>.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { planDeskCheckpointChain, replayDeskCheckpointChain } from '../src/lib/desk-checkpoint-delta.js';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = 'artifacts/e2e';
mkdirSync(ARTIFACT_DIR, { recursive: true });

/*
 * Two builds that differ in a way the Preview can be asked about directly. The
 * heading is the assertion: "the first tree came back" has to mean this exact
 * string, or the step passes for any older-looking state.
 */
const FIRST_HEADING = 'Rewind Gate One';
const SECOND_HEADING = 'Rewind Gate Two';
const page1 = (heading) => `<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><main><h1 data-testid="rewind-heading">${heading}</h1></main></body></html>`;
const CSS = 'body { font-family: sans-serif; }';

const fenced = (lang, path, body) => ['```' + lang + ` filepath="${path}"`, body, '```'].join('\n');
const replyFor = (heading, extra = null) => [
  `Built ${heading}.`,
  '',
  fenced('html', 'index.html', page1(heading)),
  '',
  fenced('css', 'styles.css', CSS),
  ...(extra ? ['', fenced('js', extra.path, extra.body)] : []),
].join('\n');

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Rewind Gate', latencyMs: 18, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const evidence = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  steps: [],
  chatTurns: [],
  alerts: [],
};

const browser = await chromium.launch({
  headless: true,
  ...(process.env.QUANTORA_E2E_CHROMIUM ? { executablePath: process.env.QUANTORA_E2E_CHROMIUM } : {}),
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('dialog', async (dialog) => { evidence.alerts.push(dialog.message()); await dialog.dismiss().catch(() => {}); });

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_studio_chat_width_pct');
  localStorage.removeItem('quantora_desk_files_width_px');
});

const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const postedJson = (request) => { try { return JSON.parse(request.postData() || '{}'); } catch { return {}; } };
const savedDesks = new Map();
let activeSavedDesk = null;

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  if (path === '/api/desk-checkpoints') {
    const body = postedJson(request);
    const sessionId = method === 'POST' ? body.sessionId : new URL(request.url()).searchParams.get('sessionId');
    const stored = savedDesks.get(sessionId) || { steps: [], revision: 0 };
    if (method === 'GET') return route.fulfill(json(200, stored));
    if (body.expectedRevision !== stored.revision) return route.fulfill(json(409, { error: 'stale revision' }));
    const plan = planDeskCheckpointChain(body.history);
    if (plan.stoppedAt) return route.fulfill(json(400, { error: plan.reason }));
    activeSavedDesk = { steps: plan.steps, revision: stored.revision + 1 };
    savedDesks.set(sessionId, activeSavedDesk);
    return route.fulfill(json(200, { saved: plan.steps.length, revision: activeSavedDesk.revision }));
  }
  if (path === '/api/auth/session') {
    return route.fulfill(json(200, { user: { sub: 'rewind-gate', name: 'Rewind Gate', email: 'rewind-gate@quantora.invalid', picture: null, isAdmin: false } }));
  }
  if (path === '/api/models') {
    return route.fulfill(json(200, { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'synthetic', available: true }] }));
  }
  if (path === '/api/plan-turn') return route.fulfill(json(500, { error: 'planner offline in this gate' }));
  if (path === '/api/preview-compile' && method === 'POST') {
    try {
      return route.fulfill(json(200, await compilePreviewVfs(postedJson(request).vfs || {})));
    } catch (error) {
      return route.fulfill(json(400, { error: error?.message || 'compile failed' }));
    }
  }
  if (path === '/api/chat' && method === 'POST') {
    const body = postedJson(request);
    const message = String(body.message || '');
    evidence.chatTurns.push({ message: message.slice(0, 80) });
    // Chosen by what was asked for, never by a turn counter: a counter
    // mislabels every later assertion the moment the client sends one request
    // more or fewer than this file assumed.
    const second = /second|rename|change the heading/i.test(message);
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody(second ? replyFor(SECOND_HEADING, { path: 'later.js', body: 'export const added = true;' }) : replyFor(FIRST_HEADING)),
    });
  }
  return route.fulfill(json(200, { ok: true }));
});

async function visible(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

/** The heading the running Preview is actually showing, or null. */
async function previewHeading(expected, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let seen = null;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const text = await frame.locator('[data-testid="rewind-heading"]').first().innerText({ timeout: 250 }).catch(() => null);
      if (text) {
        seen = text.trim();
        if (seen === expected) return seen;
      }
    }
    await page.waitForTimeout(300);
  }
  return seen;
}

async function pageState() {
  return {
    url: page.url(),
    rewindVisible: await page.locator('[data-quantora-desk-rewind]').first().isVisible().catch(() => false),
    menuItems: await page.locator('[data-quantora-desk-rewind-item]').count().catch(() => 0),
    heading: await previewHeading('__never__', 1500).catch(() => null),
    review: await page.locator('[data-quantora-desk-review="true"]').first().isVisible().catch(() => false),
    chatTurns: evidence.chatTurns,
    alerts: evidence.alerts,
    consoleErrors: consoleErrors.slice(-5),
  };
}

let currentStep = 'boot';
async function step(name, run) {
  currentStep = name;
  const startedAt = Date.now();
  await run();
  evidence.steps.push({ name, ms: Date.now() - startedAt });
}

const rewindButton = () => page.locator('[data-quantora-desk-rewind]').first();
const openRewindMenu = async () => {
  await visible(rewindButton(), 'The desk chrome has no Rewind control ([data-quantora-desk-rewind]).', 20_000);
  await rewindButton().click();
  await visible(page.locator('[data-quantora-desk-rewind-menu="true"]').first(), 'The Rewind menu did not open ([data-quantora-desk-rewind-menu]).');
};

let composer;

try {
  await step('two builds leave two checkpoints, and the menu lists them', async () => {
    await page.goto(`${BASE_URL}/desk`, { waitUntil: 'domcontentloaded' });
    ({ composer } = await enterSignedInStudio(page));

    await composer.fill('Build a page titled Rewind Gate One');
    await composer.press('Enter');
    const first = await previewHeading(FIRST_HEADING);
    if (first !== FIRST_HEADING) throw new Error(`The first build never rendered; Preview shows ${JSON.stringify(first)}.`);

    await composer.fill('Now change the heading to the second version');
    await composer.press('Enter');
    const second = await previewHeading(SECOND_HEADING);
    if (second !== SECOND_HEADING) throw new Error(`The second build never replaced the first; Preview shows ${JSON.stringify(second)}.`);

    await openRewindMenu();
    const count = await page.locator('[data-quantora-desk-rewind-item]').count();
    if (count < 2) throw new Error(`Two builds produced ${count} checkpoint(s) in the menu; rewind has nothing to go back to.`);
  });

  /*
   * The refusal. A rewind to where you already are does nothing, and an entry
   * that invites that click is a control that appears broken.
   */
  await step('the checkpoint the desk is already on is not offered', async () => {
    const current = page.locator('[data-quantora-desk-rewind-item][data-quantora-desk-rewind-current="true"]').first();
    await visible(current, 'No entry is marked as the checkpoint the desk is currently on, so the menu cannot say where you are.');
    if (await current.isEnabled().catch(() => false)) {
      throw new Error('The checkpoint the desk is already on is clickable; rewinding to it does nothing and reads as a broken control.');
    }
    const others = page.locator('[data-quantora-desk-rewind-item][data-quantora-desk-rewind-current="false"]').first();
    await visible(others, 'Every checkpoint is marked current, so there is nothing to rewind to.');
    if (!(await others.isEnabled().catch(() => false))) throw new Error('An earlier checkpoint is disabled, so rewind cannot be used at all.');
  });

  /*
   * THE STEP THIS GATE EXISTS FOR.
   *
   * Asserted on the RUNNING PREVIEW, because a rewind that updates state and
   * leaves the rendered page alone is invisible from inside and is exactly what
   * this journey hides.
   */
  await step('restoring an earlier checkpoint brings back that tree, in the Preview', async () => {
    const earlier = page.locator('[data-quantora-desk-rewind-item][data-quantora-desk-rewind-current="false"]').last();
    await earlier.click();
    const restored = await previewHeading(FIRST_HEADING);
    if (restored !== FIRST_HEADING) {
      throw new Error(`After rewinding, Preview shows ${JSON.stringify(restored)} rather than the first build's ${JSON.stringify(FIRST_HEADING)}; the running page did not go back.`);
    }
  });

  await step('the desk says what the rewind changed', async () => {
    const review = page.locator('[data-quantora-desk-review="true"]').first();
    await visible(review, 'Nothing on screen accounts for the rewind: the files changed underneath the person in silence.', 10_000);
  });

  await step('saved server head matches the restored Preview', async () => {
    const deadline = Date.now() + 10_000;
    let restored;
    while (Date.now() < deadline) {
      restored = replayDeskCheckpointChain({ steps: activeSavedDesk?.steps || [] });
      if (restored.ok && restored.vfs['index.html']?.includes(FIRST_HEADING)) break;
      await page.waitForTimeout(100);
    }
    if (!restored?.ok || !restored.vfs['index.html']?.includes(FIRST_HEADING) || 'later.js' in restored.vfs) {
      throw new Error('Rewind changed Preview but the persisted server head still contains the later build.');
    }
    evidence.savedRevision = activeSavedDesk.revision;
  });

  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-rewind.png`, fullPage: true });
  evidence.completedAt = new Date().toISOString();
  writeFileSync(`${ARTIFACT_DIR}/desk-rewind-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`DESK REWIND | passed | ${evidence.steps.map((entry) => `${entry.name} (${entry.ms}ms)`).join(' → ')}`);
  await browser.close();
  process.exit(0);
} catch (error) {
  const state = await pageState().catch(() => ({ snapshotFailed: true }));
  evidence.failedAt = new Date().toISOString();
  evidence.failedStep = currentStep;
  evidence.error = error?.message || String(error);
  evidence.pageState = state;
  writeFileSync(`${ARTIFACT_DIR}/desk-rewind-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-rewind-failure.png`, fullPage: true }).catch(() => {});
  console.error('Desk rewind gate FAILED:', error?.stack || error);
  console.error('Desk rewind evidence:', JSON.stringify(evidence, null, 2));
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').slice(0, 260);
  console.error(`\nDESK REWIND | FAILED at: ${currentStep} | why: ${oneLine(error?.message || error)} | state: rewind=${state.rewindVisible} items=${state.menuItems} heading=${JSON.stringify(state.heading)} review=${state.review} turns=${JSON.stringify(state.chatTurns)}`);
  await browser.close();
  process.exit(1);
}
