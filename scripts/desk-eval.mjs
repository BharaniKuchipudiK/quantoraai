#!/usr/bin/env node
/**
 * DESK EVAL — drive real prompts at a real deployment and record what breaks.
 *
 * Every browser gate here stubs the model, so they prove the platform and not
 * the product. The deployed golden runs real turns but a fixed handful. This
 * runs a corpus of prompts whose answers a machine can check, and writes down
 * every failure with the evidence to reproduce it.
 *
 *   node scripts/desk-eval.mjs --tier smoke
 *
 * Required, same as the deployed golden:
 *   QUANTORA_E2E_BASE_URL              the deployment to drive (https)
 *   QUANTORA_GOLDEN_CANARY_TOKEN       exempts the run from the turn budget,
 *                                      so an eval never consumes a user's day
 *   VERCEL_AUTOMATION_BYPASS_SECRET    preview deployments only
 *
 * COST IS PRINTED BEFORE ANYTHING RUNS. Each case is a live model turn.
 *
 * ── WHAT REVIEW CAUGHT IN THE FIRST VERSION ────────────────────────────────
 * Four of these were P1 and every one of them would have made the suite lie.
 * They are worth naming because each is a way a test harness reports success
 * while measuring nothing:
 *
 *   - It waited on `data-quantora-turn-busy`, WHICH DOES NOT EXIST. With a
 *     preview already on screen the wait fell straight through, so any second
 *     turn graded the PREVIOUS artifact — invalidating every multi-turn
 *     adversarial case, which is the half of the corpus that matters most.
 *   - It opened a new page per case in one BrowserContext. Same origin, same
 *     localStorage: case two reopened case one's chat and desk.
 *   - `filesUnchanged` and `headingColorChanged` were declared in the corpus,
 *     asserted by the gate to be "mechanically checkable", and READ BY
 *     NOTHING. The refine and question cases passed unconditionally — a check
 *     that cannot fail (§4), inside the suite written to enforce §4.
 *   - A failed preview keeps its wrapper visible and reports through
 *     `data-quantora-preview-error`, which went unread. A preview outage would
 *     have scored as a non-blocking behaviour miss and left CI green: the
 *     green-check-over-a-red-log this whole corpus exists to prevent.
 *   - It read file names from `data-quantora-file-name`, ALSO NOT A REAL HOOK.
 *   - A full run could exceed the job timeout and never write its report,
 *     exactly when widespread failure makes the report most valuable.
 *
 * The harness proof that missed all six was a single-turn case on a fresh page
 * with no prior preview — the one shape where none of them can appear.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { casesForTier, estimateRun } from '../src/lib/desk-eval-corpus.js';
import { OUTCOME, renderReport, verdictFor } from '../src/lib/desk-eval-outcome.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')
    ? process.argv[idx + 1]
    : fallback;
};

const TIER = arg('tier', 'smoke');
const FLOOR = Number(arg('floor', process.env.QUANTORA_DESK_EVAL_FLOOR || '0'));
const BASE_URL = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
const CANARY_TOKEN = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
const BYPASS_TOKEN = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/desk-eval';
const TURN_TIMEOUT_MS = Number(process.env.QUANTORA_DESK_EVAL_TURN_TIMEOUT_MS || 180_000);
const EXECUTABLE = process.env.QUANTORA_E2E_CHROMIUM || undefined;

const cases = casesForTier(TIER);
const plan = estimateRun(TIER);
console.log(`Desk eval — tier "${TIER}": ${plan.cases} case(s), ${plan.turns} live model turn(s), roughly $${plan.estimatedUsd}.`);
if (!/^https?:\/\//.test(BASE_URL)) {
  console.error('QUANTORA_E2E_BASE_URL must be set to the deployment to drive.');
  process.exit(2);
}
if (!CANARY_TOKEN) {
  console.error("QUANTORA_GOLDEN_CANARY_TOKEN is required: without it the eval spends a real user's daily turn budget.");
  process.exit(2);
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}) });

const results = [];
let turnsSpent = 0;

/* ------------------------------------------------------------------ reading */

const frame = (page) => page.frameLocator('iframe').first();
const count = (page, selector) => page.locator(selector).count().catch(() => 0);

async function previewText(page) {
  return (await frame(page).locator('body').innerText({ timeout: 4000 }).catch(() => '')) || '';
}
async function previewBackground(page) {
  return frame(page).locator('body').evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
}
async function headingColor(page) {
  return frame(page).locator('h1, h2').first().evaluate((el) => getComputedStyle(el).color).catch(() => null);
}

/**
 * File names as the desk actually renders them.
 *
 * The tree is `[data-quantora-file-tree]` and each row is a <button title=path>.
 * The first version queried `data-quantora-file-name`, which does not exist, so
 * a correct multi-file build scored as a miss for want of a selector.
 */
async function deskFiles(page) {
  return page.locator('[data-quantora-file-tree] button').evaluateAll(
    (nodes) => nodes.map((n) => n.getAttribute('title') || n.textContent.trim()).filter(Boolean).sort(),
  ).catch(() => []);
}

/* --------------------------------------------------------------- completion */

/**
 * WAIT FOR EVIDENCE BELONGING TO THIS TURN, NOT FOR A FLAG.
 *
 * The reply element appears as soon as streaming starts, so its presence means
 * "began", never "finished". Settling is the honest signal: the answer exists,
 * and the desk has stopped changing. That holds whether or not any particular
 * hook is on screen, which is what the first version got wrong by depending on
 * one that was never there.
 */
async function waitForTurn(page, baseline) {
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  let stableFor = 0;
  let last = '';

  while (Date.now() < deadline) {
    if (await count(page, '[data-quantora-last-turn-failed="true"]')) return 'failed';

    const prose = await count(page, '[data-quantora-assistant-prose]');
    const answered = prose > baseline.prose;
    const busy = await page.locator('[data-quantora-preview-turn-busy="true"]').count().catch(() => 0);
    const signature = JSON.stringify([await deskFiles(page), (await previewText(page)).slice(0, 400)]);

    if (answered && !busy && signature === last) {
      stableFor += 1;
      if (stableFor >= 3) return 'settled';
    } else {
      stableFor = 0;
    }
    last = signature;
    await page.waitForTimeout(1200);
  }
  return 'timeout';
}

/* ------------------------------------------------------------- classification */

/**
 * Did the platform do its job? Returns a BLOCKING outcome or null. Nothing here
 * depends on what the model chose to write.
 */
async function platformOutcome(page, { chatRequests, maxChatRequests, expectsPreview }) {
  if (await count(page, '[data-quantora-last-turn-failed="true"]')) {
    return { outcome: OUTCOME.TURN_ERROR, detail: 'the desk marked the turn failed' };
  }
  if (!(await page.locator('.app-shell--studio textarea').first().isVisible().catch(() => false))) {
    return { outcome: OUTCOME.DESK_CRASH, detail: 'the composer disappeared — the desk stopped rendering' };
  }
  if (Number.isFinite(maxChatRequests) && chatRequests > maxChatRequests) {
    return { outcome: OUTCOME.REQUEST_STORM, detail: `one message produced ${chatRequests} /api/chat requests (limit ${maxChatRequests})` };
  }
  if (!(await count(page, '[data-quantora-assistant-prose]'))) {
    return { outcome: OUTCOME.NO_REPLY, detail: 'no assistant reply rendered' };
  }
  if (expectsPreview) {
    const wrapper = page.locator('[data-quantora-real-project-preview="true"]').first();
    if (!(await wrapper.isVisible().catch(() => false))) {
      return { outcome: OUTCOME.NO_PREVIEW, detail: 'the build produced nothing runnable' };
    }
    /*
     * A FAILED PREVIEW KEEPS ITS WRAPPER. ProjectRuntimePreview stays mounted
     * on a compile or runtime failure and reports through this attribute. Read
     * only the wrapper's visibility and a preview outage becomes a non-blocking
     * behaviour miss — CI green over a dead product.
     */
    const previewError = await wrapper.getAttribute('data-quantora-preview-error').catch(() => null);
    if (previewError && previewError !== 'false') {
      return { outcome: OUTCOME.NO_PREVIEW, detail: `the preview reported an error: ${previewError}` };
    }
  }
  return null;
}

/* --------------------------------------------------------------- expectations */

async function checkExpectations(page, expect = {}, before = {}) {
  const misses = [];
  const missing = async (needles) => {
    const text = await previewText(page);
    return (needles || []).filter((needle) => !new RegExp(needle, 'i').test(text));
  };

  for (const gone of await missing(expect.showsText)) misses.push(`never showed "${gone}"`);

  if (expect.absentText) {
    const text = await previewText(page);
    for (const banned of expect.absentText) {
      if (new RegExp(banned, 'i').test(text)) misses.push(`left "${banned}" in the page`);
    }
  }

  if (Number.isFinite(expect.minRows)) {
    const rows = await frame(page).locator('tr, li').count().catch(() => 0);
    if (rows < expect.minRows) misses.push(`showed ${rows} rows, expected at least ${expect.minRows}`);
  }

  /* Declared in the corpus AND read here — the pairing the gate now enforces. */
  if (expect.filesUnchanged) {
    const after = await deskFiles(page);
    if (JSON.stringify(after) !== JSON.stringify(before.files || [])) {
      misses.push(`a question rewrote the desk: ${JSON.stringify(before.files || [])} became ${JSON.stringify(after)}`);
    }
  }
  if (expect.headingColorChanged) {
    const after = await headingColor(page);
    if (!after || after === before.headingColor) misses.push(`the heading colour did not change (still ${after || 'unreadable'})`);
  }

  for (const step of expect.steps || []) {
    const bgBefore = step.thenBackgroundChanges ? await previewBackground(page) : null;
    if (step.fill) await fillIn(page, step.fill.value);
    if (step.fillAll) for (let i = 0; i < step.fillAll.length; i += 1) await fillIn(page, step.fillAll[i], i);
    if (step.click && !(await clickIn(page, step.click))) { misses.push('found no control to click'); continue; }
    await page.waitForTimeout(700);

    for (const gone of await missing(step.thenShows)) misses.push(`after interacting, never showed "${gone}"`);
    if (step.thenHides) {
      const text = await previewText(page);
      for (const stillThere of step.thenHides) {
        if (new RegExp(stillThere, 'i').test(text)) misses.push(`"${stillThere}" was still there after removing it`);
      }
    }
    if (step.thenRowsAtMost !== undefined) {
      const rows = await frame(page).locator('tr, li').count().catch(() => 0);
      if (rows > step.thenRowsAtMost) misses.push(`filter left ${rows} rows, expected at most ${step.thenRowsAtMost}`);
    }
    if (step.thenBackgroundChanges) {
      const bgAfter = await previewBackground(page);
      if (bgBefore && bgAfter && bgBefore === bgAfter) misses.push('the theme toggle changed nothing');
    }
  }

  if (expect.showsTextOrEntryChoice) {
    const text = await previewText(page);
    const absent = expect.showsTextOrEntryChoice.filter((n) => !new RegExp(n, 'i').test(text));
    if (absent.length && !(await count(page, '[data-quantora-desk-preview-entry-select="true"]'))) {
      misses.push(`the new page was neither shown nor reachable (missing ${absent.join(', ')}, no entry chooser)`);
    }
  }

  if (expect.files) {
    const names = (await deskFiles(page)).join(' ');
    for (const file of expect.files) if (!names.includes(file)) misses.push(`no file named ${file} on the desk`);
  }
  return misses;
}

async function clickIn(page, { textLike }) {
  const f = frame(page);
  if (textLike) {
    const byText = f.locator('button, [role="button"], input[type="button"], input[type="submit"], a')
      .filter({ hasText: new RegExp(textLike, 'i') }).first();
    if (await byText.count().catch(() => 0)) { await byText.click({ timeout: 4000 }).catch(() => {}); return true; }
  }
  const any = f.locator('button, [role="button"], input[type="submit"]').first();
  if (await any.count().catch(() => 0)) { await any.click({ timeout: 4000 }).catch(() => {}); return true; }
  return false;
}

async function fillIn(page, value, index = 0) {
  const input = frame(page).locator('input:not([type="button"]):not([type="submit"]), textarea').nth(index);
  if (!(await input.count().catch(() => 0))) return false;
  await input.fill(String(value), { timeout: 4000 }).catch(() => {});
  return true;
}

/* ------------------------------------------------------------------- the run */

const meta = () => ({ tier: TIER, target: BASE_URL, ranAt: new Date().toISOString(), turns: turnsSpent, floor: FLOOR });

/* Written after EVERY case: a run killed by the job timeout must still leave
 * the findings it had already collected. */
function persist() {
  writeFileSync(`${ARTIFACT_DIR}/report.md`, `${renderReport(results, meta())}\n`);
  writeFileSync(`${ARTIFACT_DIR}/results.json`, `${JSON.stringify({ meta: meta(), results }, null, 2)}\n`);
}

for (const testCase of cases) {
  const started = Date.now();
  /* A FRESH CONTEXT PER CASE. Pages in one context share localStorage for the
   * same origin, and Studio persists chat sessions and desk snapshots there —
   * so case two would reopen case one's conversation and grade its build. */
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    extraHTTPHeaders: {
      'X-Quantora-Golden-Canary': CANARY_TOKEN,
      ...(BYPASS_TOKEN ? { 'x-vercel-protection-bypass': BYPASS_TOKEN } : {}),
    },
  });
  const page = await context.newPage();
  const chat = { count: 0 };
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/chat') chat.count += 1; });

  let row = { id: testCase.id, tier: testCase.tier, prompt: testCase.prompt, incident: testCase.incident };
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    const enter = page.locator('[data-quantora-enter-studio]').first();
    if (await enter.isVisible({ timeout: 20_000 }).catch(() => false)) await enter.click();
    await page.locator('.app-shell--studio textarea').first().waitFor({ state: 'visible', timeout: 30_000 });

    const turns = testCase.turns || [{ prompt: testCase.prompt, expect: testCase.expect }];
    let outcome = OUTCOME.PASS;
    let detail = '';

    for (const turn of turns) {
      const expect = turn.expect || {};
      const before = { files: await deskFiles(page), headingColor: await headingColor(page) };
      const baseline = { prose: await count(page, '[data-quantora-assistant-prose]') };

      chat.count = 0;
      const composer = page.locator('.app-shell--studio textarea').first();
      await composer.fill(turn.prompt);
      await composer.press('Enter');
      turnsSpent += 1;

      const how = await waitForTurn(page, baseline);
      if (how === 'timeout') { outcome = OUTCOME.TIMEOUT; detail = `no answer within ${Math.round(TURN_TIMEOUT_MS / 1000)}s`; break; }

      const fault = await platformOutcome(page, {
        chatRequests: chat.count,
        maxChatRequests: testCase.maxChatRequests,
        // A question is not a build: it owes an answer, not a runnable page.
        expectsPreview: !expect.filesUnchanged,
      });
      if (fault) { outcome = fault.outcome; detail = fault.detail; break; }

      const misses = await checkExpectations(page, expect, before);
      if (misses.length) { outcome = OUTCOME.BEHAVIOR_MISS; detail = misses.join('; '); break; }
    }
    row = { ...row, outcome, detail };
  } catch (error) {
    row = { ...row, outcome: OUTCOME.DESK_CRASH, detail: String(error?.message || error).split('\n')[0] };
  }

  row.seconds = Math.round((Date.now() - started) / 1000);
  if (row.outcome !== OUTCOME.PASS) {
    row.screenshot = `${ARTIFACT_DIR}/${testCase.id}.png`;
    await page.screenshot({ path: row.screenshot, fullPage: true }).catch(() => {});
  }
  console.log(`  ${row.outcome === OUTCOME.PASS ? 'ok  ' : 'FAIL'} ${testCase.id} (${row.seconds}s)${row.detail ? ` — ${row.detail}` : ''}`);
  results.push(row);
  persist();
  await context.close();
}

await browser.close();
persist();

const report = renderReport(results, meta());
console.log('');
console.log(report.slice(report.lastIndexOf('DESK EVAL |')));
process.exitCode = verdictFor(results, { floor: FLOOR }).ok ? 0 : 1;
