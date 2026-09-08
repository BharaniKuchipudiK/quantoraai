#!/usr/bin/env node
/**
 * DESK EVAL — drive real prompts at a real deployment and record what breaks.
 *
 * Every browser gate here stubs the model, so they prove the platform and not
 * the product. The deployed golden runs real turns but a fixed handful. This
 * runs a corpus of prompts whose answers a machine can check, and writes down
 * every failure with the evidence to reproduce it — so defects are found by a
 * script on a schedule instead of by the owner in a screenshot.
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
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { casesForTier, estimateRun, turnsForCase } from '../src/lib/desk-eval-corpus.js';
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
  console.error('QUANTORA_GOLDEN_CANARY_TOKEN is required: without it the eval spends a real user\'s daily turn budget.');
  process.exit(2);
}

mkdirSync(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}) });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  extraHTTPHeaders: {
    'X-Quantora-Golden-Canary': CANARY_TOKEN,
    ...(BYPASS_TOKEN ? { 'x-vercel-protection-bypass': BYPASS_TOKEN } : {}),
  },
});

const results = [];
let turnsSpent = 0;

/* ------------------------------------------------------------------ helpers */

const frame = (page) => page.frameLocator('iframe').first();

async function previewText(page) {
  return (await frame(page).locator('body').innerText({ timeout: 4000 }).catch(() => '')) || '';
}

async function previewBackground(page) {
  return frame(page).locator('body').evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
}

/** Structural click: prefer a control whose visible words the PROMPT asked for. */
async function clickIn(page, { textLike }) {
  const f = frame(page);
  if (textLike) {
    const byText = f.locator('button, [role="button"], input[type="button"], input[type="submit"], a')
      .filter({ hasText: new RegExp(textLike, 'i') }).first();
    if (await byText.count().catch(() => 0)) { await byText.click({ timeout: 4000 }); return true; }
  }
  const anyButton = f.locator('button, [role="button"], input[type="submit"]').first();
  if (await anyButton.count().catch(() => 0)) { await anyButton.click({ timeout: 4000 }); return true; }
  return false;
}

async function fillIn(page, value, index = 0) {
  const input = frame(page).locator('input:not([type="button"]):not([type="submit"]), textarea').nth(index);
  if (!(await input.count().catch(() => 0))) return false;
  await input.fill(String(value), { timeout: 4000 });
  return true;
}

/**
 * Did the platform do its job on this turn?
 *
 * Deliberately separate from "is the answer right": this returns a BLOCKING
 * outcome or null, and nothing here depends on what the model chose to write.
 */
async function platformOutcome(page, { chatRequests, maxChatRequests }) {
  if (await page.locator('[data-quantora-last-turn-failed="true"]').count().catch(() => 0)) {
    return { outcome: OUTCOME.TURN_ERROR, detail: 'the desk marked the turn failed' };
  }
  if (!(await page.locator('.app-shell--studio textarea').first().isVisible().catch(() => false))) {
    return { outcome: OUTCOME.DESK_CRASH, detail: 'the composer disappeared — the desk stopped rendering' };
  }
  if (Number.isFinite(maxChatRequests) && chatRequests > maxChatRequests) {
    return {
      outcome: OUTCOME.REQUEST_STORM,
      detail: `one message produced ${chatRequests} /api/chat requests (limit ${maxChatRequests})`,
    };
  }
  const prose = await page.locator('[data-quantora-assistant-prose]').count().catch(() => 0);
  if (!prose) return { outcome: OUTCOME.NO_REPLY, detail: 'no assistant reply rendered' };
  return null;
}

/* --------------------------------------------------------------- expectations */

async function checkExpectations(page, expect = {}) {
  const misses = [];
  const has = async (needles) => {
    const text = await previewText(page);
    return (needles || []).filter((needle) => !new RegExp(needle, 'i').test(text));
  };

  for (const missing of await has(expect.showsText)) misses.push(`never showed "${missing}"`);

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

  for (const step of expect.steps || []) {
    const before = step.thenBackgroundChanges ? await previewBackground(page) : null;

    if (step.fill) await fillIn(page, step.fill.value);
    if (step.fillAll) {
      for (let i = 0; i < step.fillAll.length; i += 1) await fillIn(page, step.fillAll[i], i);
    }
    if (step.click && !(await clickIn(page, step.click))) {
      misses.push('found no control to click');
      continue;
    }
    await page.waitForTimeout(700);

    for (const missing of await has(step.thenShows)) misses.push(`after interacting, never showed "${missing}"`);
    if (step.thenHides) {
      const text = await previewText(page);
      for (const gone of step.thenHides) {
        if (new RegExp(gone, 'i').test(text)) misses.push(`"${gone}" was still there after removing it`);
      }
    }
    if (step.thenRowsAtMost !== undefined) {
      const rows = await frame(page).locator('tr, li').count().catch(() => 0);
      if (rows > step.thenRowsAtMost) misses.push(`filter left ${rows} rows, expected at most ${step.thenRowsAtMost}`);
    }
    if (step.thenBackgroundChanges) {
      const after = await previewBackground(page);
      if (before && after && before === after) misses.push('the theme toggle changed nothing');
    }
  }

  /*
   * The second-build case: the desk is honest if it either renders the new page
   * OR offers a visible way to reach it. Both were built for exactly this, and
   * treating the switcher as a failure would punish the fix.
   */
  if (expect.showsTextOrEntryChoice) {
    const text = await previewText(page);
    const missing = expect.showsTextOrEntryChoice.filter((n) => !new RegExp(n, 'i').test(text));
    if (missing.length) {
      const chooser = await page.locator('[data-quantora-desk-preview-entry-select="true"]').count().catch(() => 0);
      if (!chooser) misses.push(`the new page was neither shown nor reachable (missing ${missing.join(', ')}, no entry chooser)`);
    }
  }

  if (expect.files) {
    const names = await page.locator('[data-quantora-file-name], [data-quantora-desk-tab]').allInnerTexts().catch(() => []);
    const blob = names.join(' ');
    for (const file of expect.files) {
      if (!blob.includes(file)) misses.push(`no file named ${file} on the desk`);
    }
  }

  return misses;
}

/* ------------------------------------------------------------------- the run */

async function runTurn(page, prompt, { chatCounter, maxChatRequests }) {
  const composer = page.locator('.app-shell--studio textarea').first();
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  chatCounter.count = 0;
  await composer.fill(prompt);
  await composer.press('Enter');
  turnsSpent += 1;

  const deadline = Date.now() + TURN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const busy = await page.locator('[data-quantora-turn-busy="true"]').count().catch(() => 0);
    const preview = await page.locator('[data-quantora-real-project-preview="true"]').isVisible().catch(() => false);
    const failed = await page.locator('[data-quantora-last-turn-failed="true"]').count().catch(() => 0);
    if (failed) break;
    if (!busy && preview) break;
    await page.waitForTimeout(1500);
  }
  if (Date.now() >= deadline) return { outcome: OUTCOME.TIMEOUT, detail: `no answer within ${Math.round(TURN_TIMEOUT_MS / 1000)}s` };
  return await platformOutcome(page, { chatRequests: chatCounter.count, maxChatRequests });
}

for (const testCase of cases) {
  const started = Date.now();
  const page = await context.newPage();
  const chatCounter = { count: 0 };
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/chat') chatCounter.count += 1; });

  let row = { id: testCase.id, tier: testCase.tier, prompt: testCase.prompt, incident: testCase.incident };
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    const enter = page.locator('[data-quantora-enter-studio]').first();
    if (await enter.isVisible({ timeout: 20_000 }).catch(() => false)) await enter.click();

    const turns = testCase.turns || [{ prompt: testCase.prompt, expect: testCase.expect }];
    let outcome = OUTCOME.PASS;
    let detail = '';

    for (const turn of turns) {
      const fault = await runTurn(page, turn.prompt, { chatCounter, maxChatRequests: testCase.maxChatRequests });
      if (fault) { outcome = fault.outcome; detail = fault.detail; break; }

      const previewUp = await page.locator('[data-quantora-real-project-preview="true"]').isVisible().catch(() => false);
      if (!previewUp && !turn.expect?.filesUnchanged) {
        outcome = OUTCOME.NO_PREVIEW; detail = 'the build produced nothing runnable'; break;
      }
      const misses = await checkExpectations(page, turn.expect || {});
      if (misses.length) { outcome = OUTCOME.BEHAVIOR_MISS; detail = misses.join('; '); break; }
    }
    row = { ...row, outcome, detail };
  } catch (error) {
    row = { ...row, outcome: OUTCOME.DESK_CRASH, detail: String(error?.message || error).split('\n')[0] };
  }

  row.seconds = Math.round((Date.now() - started) / 1000);
  if (row.outcome !== OUTCOME.PASS) {
    const shot = `${ARTIFACT_DIR}/${testCase.id}.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    row.screenshot = shot;
  }
  console.log(`  ${row.outcome === OUTCOME.PASS ? 'ok  ' : 'FAIL'} ${testCase.id} (${row.seconds}s)${row.detail ? ` — ${row.detail}` : ''}`);
  results.push(row);
  await page.close();
}

await browser.close();

const meta = { tier: TIER, target: BASE_URL, ranAt: new Date().toISOString(), turns: turnsSpent, floor: FLOOR };
const report = renderReport(results, meta);
writeFileSync(`${ARTIFACT_DIR}/report.md`, `${report}\n`);
writeFileSync(`${ARTIFACT_DIR}/results.json`, `${JSON.stringify({ meta, results }, null, 2)}\n`);

const { ok } = verdictFor(results, { floor: FLOOR });
console.log('');
console.log(report.slice(report.lastIndexOf('DESK EVAL |')));
process.exitCode = ok ? 0 : 1;
