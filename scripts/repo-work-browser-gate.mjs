#!/usr/bin/env node
/*
 * SOMEBODY BRINGS A REPOSITORY THEY ALREADY HAVE, AND ASKS FOR A CHANGE TO IT.
 *
 * `github-import-repo` has been "helpers only" in the ledger since it shipped,
 * and it could not have been anything else: until this change the import path
 * carried no durable hook at all. The only way to reach it was by its words --
 * "Connect to Github", then "Import to Context" -- and this repository has
 * already paid once for a gate anchored on prose, when the copy moved to "Try
 * Quantora" and a permanently red test was written off as flaky while three
 * production endpoints stayed dead.
 *
 * WHAT THIS PROVES, AND WHY THE LAST STEP IS THE POINT
 *
 *   1. The import controls exist and are reachable by hook, not by wording.
 *   2. A repository imports and lands on the desk as context.
 *   3. A build turn puts files on the desk.
 *   4. A DEVELOPER-PHRASED follow-up goes out as a refinement -- `refineMode`
 *      true on the request -- rather than as a fresh request.
 *
 * `studioMode` is deliberately not asserted, and the first version of this gate
 * was wrong to. The client sends it ONLY when the person explicitly chose a
 * mode, so a turn that resolved to `build` internally still arrives with the
 * field absent. Asserting it here would have been asserting something that is
 * never on the wire -- and it would have passed for the wrong reason the moment
 * somebody clicked Build.
 *   5. A question about that same code does NOT, so the desk does not start
 *      writing files on somebody who was only asking.
 *
 * Steps 4 and 5 are the pair. Before `repo-work-intent.js`, "add a test for
 * the retry path" went out as studioMode `ask` with no refineMode, while "make
 * the header blue" -- the same desk, the same files -- went out correctly. A
 * unit test can show that; only this can show it surviving the whole client,
 * and step 5 is what stops step 4 being bought by a desk that treats
 * everything as an edit.
 *
 * The evidence is what the desk SENT. A turn that renders convincingly and
 * posts the wrong thing is exactly the failure this path hides.
 *
 * WHAT THE PRECISION HALF ACTUALLY COSTS, MEASURED BY BREAKING IT
 *
 * Removing the question guards and re-running did more than mislabel one turn.
 * The question went out as an edit, the prose answer then failed the desk's own
 * "did this return files?" verification, and the loop spent SEVEN retries on
 * "PREVIOUS ATTEMPT FAILED VERIFICATION: the reply described a change but
 * returned" before giving up -- a person asking a question, billed for eight
 * model calls and told their answer failed. That is the class
 * guided-intake-browser-gate exists for, reached from a different direction,
 * and it is why step 5 is not optional decoration around step 4.
 *
 * The verdict is the last line: REPO WORK | passed … or
 * REPO WORK | FAILED at <step> | <why> | <state>.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = 'artifacts/e2e';
mkdirSync(ARTIFACT_DIR, { recursive: true });

const REPO_URL = 'https://github.com/gate-owner/gate-service';
const REPO_NAME = 'gate-owner/gate-service';
const REPO_CONTENT = [
  '// server.js',
  'export async function upload(req, res) { return res.end(); }',
  '// worker.js',
  'export async function retry(fn) { return fn(); }',
].join('\n');

const STATUS_HTML = '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><main><h1 data-testid="repo-status">gate-service status</h1></main></body></html>';
const STATUS_CSS = 'body { font-family: sans-serif; }';
const TEST_JS = 'export const retryTest = () => true;';

const fenced = (lang, path, body) => ['```' + lang + ` filepath="${path}"`, body, '```'].join('\n');
const BUILD_REPLY = ['Built a status page from the repository.', '', fenced('html', 'index.html', STATUS_HTML), '', fenced('css', 'styles.css', STATUS_CSS)].join('\n');
const REFINE_REPLY = ['Added the retry test.', '', fenced('html', 'index.html', STATUS_HTML), '', fenced('css', 'styles.css', STATUS_CSS), '', fenced('js', 'retry.test.js', TEST_JS)].join('\n');
const ANSWER_REPLY = 'The worker caches the response so a retry does not re-fetch it.';

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Repo Gate', latencyMs: 18, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const evidence = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  steps: [],
  importRequests: [],
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

/*
 * The reply is chosen by what the desk asked for, not by a turn counter: a
 * counter silently mislabels every later assertion the moment the client sends
 * one request more or fewer than this file assumed.
 */
function replyFor(body) {
  const message = String(body.message || '');
  if (/retry path/i.test(message)) return REFINE_REPLY;
  if (/why does the worker/i.test(message)) return ANSWER_REPLY;
  return BUILD_REPLY;
}

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  if (path === '/api/auth/session') {
    return route.fulfill(json(200, { user: { sub: 'repo-gate', name: 'Repo Gate', email: 'repo-gate@quantora.invalid', picture: null, isAdmin: false } }));
  }
  if (path === '/api/models') {
    return route.fulfill(json(200, { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'synthetic', available: true }] }));
  }
  // Offline on purpose: the deterministic path is what this gate measures, and
  // a planner that answered would decide the lane before the client's own
  // signals were consulted at all.
  if (path === '/api/plan-turn') return route.fulfill(json(500, { error: 'planner offline in this gate' }));
  if (path === '/api/preview-compile' && method === 'POST') {
    try {
      return route.fulfill(json(200, await compilePreviewVfs(postedJson(request).vfs || {})));
    } catch (error) {
      return route.fulfill(json(400, { error: error?.message || 'compile failed' }));
    }
  }
  if (path === '/api/github/preview' && method === 'POST') {
    const body = postedJson(request);
    evidence.importRequests.push({ targetStage: body.targetStage || null, repoUrl: body.repoUrl || null, hasTask: Boolean(body.task) });
    if (body.targetStage !== 'repository-preview') return route.fulfill(json(400, { error: `wrong stage ${body.targetStage}` }));
    return route.fulfill(json(200, { name: REPO_NAME, content: REPO_CONTENT, branch: 'main' }));
  }
  if (path === '/api/chat' && method === 'POST') {
    const body = postedJson(request);
    evidence.chatTurns.push({
      message: String(body.message || '').slice(0, 120),
      buildMode: body.buildMode ?? null,
      studioMode: body.studioMode ?? null,
      refineMode: body.refineMode ?? null,
      hasDeskContext: Boolean(body.deskContext),
    });
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(replyFor(body)) });
  }
  if (path.startsWith('/api/github/')) return route.fulfill(json(200, { ok: true, connected: true, login: 'gate-owner' }));
  return route.fulfill(json(200, { ok: true }));
});

async function visible(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function frameShowing(selector, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      if (await frame.locator(selector).first().isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(400);
  }
  return null;
}

async function pageState() {
  return {
    url: page.url(),
    importError: await page.locator('[data-quantora-github-import-error="true"]').first().innerText({ timeout: 800 }).catch(() => null),
    attachmentChips: await page.locator('[data-quantora-attachment-chip]').allTextContents().catch(() => []),
    importRequests: evidence.importRequests,
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

/** Wait for the turn whose message matches, so a slow stream cannot read as a missing field. */
async function turnFor(pattern, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = evidence.chatTurns.find((turn) => pattern.test(turn.message));
    if (found) return found;
    await page.waitForTimeout(250);
  }
  return null;
}

let composer;

try {
  await step('the import controls are reachable by hook, not by their wording', async () => {
    await page.goto(`${BASE_URL}/desk`, { waitUntil: 'domcontentloaded' });
    ({ composer } = await enterSignedInStudio(page));
    const menu = page.locator('[data-quantora-attachment-menu="true"]').first();
    await visible(menu, 'The composer has no attachment menu ([data-quantora-attachment-menu]).');
    await menu.click();
    const open = page.locator('[data-quantora-github-import-open="true"]').first();
    await visible(open, 'The attachment menu has no GitHub import entry ([data-quantora-github-import-open]); the only way in is its wording again.');
    await open.click();
    await visible(
      page.locator('[data-quantora-github-import-url="true"]').first(),
      'The import dialog opened without a repository URL field ([data-quantora-github-import-url]).',
    );
  });

  await step('a repository imports and lands on the desk as context', async () => {
    await page.locator('[data-quantora-github-import-url="true"]').first().fill(REPO_URL);
    const run = page.locator('[data-quantora-github-import-run="true"]').first();
    if (!(await run.isEnabled().catch(() => false))) throw new Error('The import button is disabled with a repository URL typed.');
    await run.click();
    const chip = page.locator(`[data-quantora-attachment-chip="${REPO_NAME}"]`).first();
    await visible(chip, `The repository never appeared as an attachment (import requests: ${JSON.stringify(evidence.importRequests)}).`, 20_000);
    const kind = await chip.getAttribute('data-quantora-attachment-kind');
    if (kind !== 'context') throw new Error(`The repository attached as ${JSON.stringify(kind)}, not as context the model reads.`);
    const imported = evidence.importRequests[0];
    if (!imported) throw new Error('Import never reached /api/github/preview.');
    if (imported.repoUrl !== REPO_URL) throw new Error(`The import asked for ${imported.repoUrl}, not the URL typed (${REPO_URL}).`);
    if (!imported.hasTask) throw new Error('The import carried no task, so the server was told nothing about what to read.');
  });

  await step('a build turn puts files on the desk', async () => {
    await composer.fill('Build a small status page for this service');
    await composer.press('Enter');
    const frame = await frameShowing('[data-testid="repo-status"]');
    if (!frame) throw new Error('The build never rendered in Preview (no frame shows [data-testid="repo-status"]).');
  });

  /*
   * THE STEP THIS GATE EXISTS FOR.
   *
   * Phrased as a developer, on a desk that now holds files. Before the
   * repository vocabulary existed this went out as studioMode `ask` with no
   * refineMode -- a change to code that exists, described to the server as a
   * fresh request.
   */
  await step('a developer-phrased change goes out as a refinement', async () => {
    await composer.fill('Add a test for the retry path');
    await composer.press('Enter');
    const turn = await turnFor(/retry path/i);
    if (!turn) throw new Error(`The developer-phrased turn never reached /api/chat (turns: ${JSON.stringify(evidence.chatTurns)}).`);
    if (turn.refineMode !== true) {
      throw new Error(`The turn went out with refineMode ${JSON.stringify(turn.refineMode)}; a change to existing code is being sent as a fresh request. Turn: ${JSON.stringify(turn)}.`);
    }
    if (turn.buildMode !== true) throw new Error(`The turn went out with buildMode ${JSON.stringify(turn.buildMode)}; it was not treated as coding work at all. Turn: ${JSON.stringify(turn)}.`);
    if (!turn.hasDeskContext) throw new Error('The turn carried no desk context, so the model was asked to change files it was never shown.');
  });

  /*
   * The other half. Recall bought by treating every message as an edit is not
   * recall, and here the cost of that trade is a write on somebody who was
   * only asking.
   */
  await step('a question about the same code is not sent as an edit', async () => {
    await composer.fill('Why does the worker cache the response?');
    await composer.press('Enter');
    const turn = await turnFor(/why does the worker/i);
    if (!turn) throw new Error(`The question never reached /api/chat (turns: ${JSON.stringify(evidence.chatTurns)}).`);
    if (turn.refineMode === true) {
      throw new Error(`A question about the code went out as a refinement (refineMode true); the desk is set to rewrite files for somebody who was only asking. Turn: ${JSON.stringify(turn)}.`);
    }
  });

  await page.screenshot({ path: `${ARTIFACT_DIR}/repo-work.png`, fullPage: true });
  evidence.completedAt = new Date().toISOString();
  writeFileSync(`${ARTIFACT_DIR}/repo-work-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`REPO WORK | passed | ${evidence.steps.map((entry) => `${entry.name} (${entry.ms}ms)`).join(' → ')}`);
  await browser.close();
  process.exit(0);
} catch (error) {
  const state = await pageState().catch(() => ({ snapshotFailed: true }));
  evidence.failedAt = new Date().toISOString();
  evidence.failedStep = currentStep;
  evidence.error = error?.message || String(error);
  evidence.pageState = state;
  writeFileSync(`${ARTIFACT_DIR}/repo-work-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/repo-work-failure.png`, fullPage: true }).catch(() => {});
  console.error('Repo work gate FAILED:', error?.stack || error);
  console.error('Repo work evidence:', JSON.stringify(evidence, null, 2));
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').slice(0, 260);
  console.error(`\nREPO WORK | FAILED at: ${currentStep} | why: ${oneLine(error?.message || error)} | state: chips=${JSON.stringify(state.attachmentChips)} importError=${JSON.stringify(state.importError)} turns=${JSON.stringify(state.chatTurns)} alerts=${JSON.stringify(state.alerts)}`);
  await browser.close();
  process.exit(1);
}
