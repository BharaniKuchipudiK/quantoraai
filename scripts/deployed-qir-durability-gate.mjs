#!/usr/bin/env node
/**
 * Does a Run actually survive the worker that created it — on the real database?
 *
 * THE GAP THIS CLOSES. Phase 2's exit criterion is "prove a run survives worker
 * termination and browser refresh". Both halves were proven only against a
 * SYNTHETIC store: qir-coding-resume-browser-gate.mjs drives a real browser
 * through a real reload, but every /api/ call is fulfilled from an in-process
 * object. So the reducers were proven and the JOURNAL never was — which is how
 * the durable runtime sat as a production no-op for two days, with the tables
 * absent and every gate green. That was open question D.2 of the Phase 0
 * re-audit.
 *
 * WHY THIS IS NOT A BROWSER GATE. The browser half is already proven over the
 * real reducers, and re-proving it against a deployment would mean driving the
 * whole desk on an environment whose golden chat has never once passed — a
 * fragile test of the wrong thing. The claim that was never tested is narrower
 * and sharper: STATE WRITTEN BY ONE WORKER IS READABLE BY ANOTHER AFTER THE
 * FIRST IS GONE. That needs no browser and no model, so it is deterministic,
 * costs no provider spend, and finishes in seconds.
 *
 * Worker B below shares nothing with worker A but the run id — a separate
 * request, no in-memory state, exactly what a replacement worker has.
 *
 * IT AUTHENTICATES AS THE CANARY, which api/_lib/authz.ts pins to one fixed
 * synthetic sub. The rows it writes live in that sub's partition and no
 * customer's.
 */
import process from 'node:process';

const BASE_URL = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
const CANARY = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
const BYPASS = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');

if (!/^https:\/\//.test(BASE_URL)) throw new Error('QUANTORA_E2E_BASE_URL must be an HTTPS deployment URL.');
if (CANARY.length < 24) throw new Error('QUANTORA_GOLDEN_CANARY_TOKEN is missing or too short.');

const headers = {
  'Content-Type': 'application/json',
  'X-Quantora-Golden-Canary': CANARY,
  ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
};

const runId = `deployed-durability-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const failures = [];

/** One request. Shares nothing with any other — that is the point. */
async function call(body, query = '') {
  const response = await fetch(`${BASE_URL}/api/qir-runs${query}`, body
    ? { method: 'POST', headers, body: JSON.stringify(body) }
    : { method: 'GET', headers });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* keep the raw text for the message */ }
  return { status: response.status, data, text: text.slice(0, 400) };
}

const now = new Date().toISOString();
const queued = {
  version: 'qir-contracts-2026-09-02.1',
  runId,
  goal: { statement: 'Deployed durability probe', status: 'confirmed' },
  status: 'QUEUED',
  steps: [],
  cursor: { stepId: null, actionId: null, attempt: 0 },
  artifacts: [],
  observations: [],
  verifications: [],
  checkpoints: [],
  budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
  createdAt: now,
  updatedAt: now,
};

// ---- worker A: create a Run and advance it -------------------------------
const created = await call({ run: queued });
if (created.status === 401) {
  failures.push(
    'the deployment refused the golden canary on /api/qir-runs (401). The canary identity in '
    + 'api/_lib/authz.ts is what lets CI reach the durable journal; if that is deployed, check '
    + 'QUANTORA_GOLDEN_CANARY_TOKEN matches this deployment.',
  );
} else if (created.status === 503) {
  const reason = created.data?.reason || '';
  const cause = created.data?.diagnosis?.cause || '';
  failures.push(`durable storage refused the write (${reason}${cause ? `: ${cause}` : ''}). ${created.text}`);
} else if (created.status !== 201 && created.status !== 200) {
  failures.push(`could not create a durable Run (HTTP ${created.status}): ${created.text}`);
}

let attemptVersion = null;
if (!failures.length) {
  const attempt = await call({ action: 'coding.attempt', runId, strategy: 'deployed-durability-probe' });
  if (attempt.status !== 200) failures.push(`coding.attempt was refused (HTTP ${attempt.status}): ${attempt.text}`);
  else attemptVersion = attempt.data?.storageVersion ?? null;
}

// ---- worker B: a different request, holding nothing but the run id -------
if (!failures.length) {
  const resumed = await call(null, `?runId=${encodeURIComponent(runId)}`);

  if (resumed.status !== 200) {
    failures.push(`a replacement worker could not read the Run back (HTTP ${resumed.status}): ${resumed.text}`);
  } else {
    const run = resumed.data?.run;
    if (!run) failures.push('the durable read returned no Run at all.');
    else {
      if (run.runId !== runId) failures.push(`read back a different Run: ${run.runId}`);
      if (run.status !== 'EXECUTING') {
        failures.push(`the attempt did not survive: expected EXECUTING, read ${run.status}. A worker that cannot see the attempt will start it again.`);
      }
      if (!run.cursor?.actionId) failures.push('the resumed Run has no action to continue from.');
      if (!resumed.data?.continuation) failures.push('the route offered no continuation, so a replacement worker has nowhere to resume.');
      /*
       * The ordinary lane is spent by coding.attempt. Reading it back proves the
       * debit was PERSISTED rather than only computed — a budget that resets on
       * worker loss is not a budget.
       */
      if (run.budget?.runUnitsRemaining !== 99) {
        failures.push(`the ordinary spend did not persist: runUnitsRemaining read back as ${run.budget?.runUnitsRemaining}, expected 99.`);
      }
      if (attemptVersion !== null && resumed.data?.storageVersion !== attemptVersion) {
        failures.push(`storageVersion drifted between workers: wrote ${attemptVersion}, read ${resumed.data?.storageVersion}.`);
      }
    }
  }
}

if (failures.length) {
  console.error(`\nDeployed QIR durability gate FAILED against ${BASE_URL}\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('\nA Run does not survive the worker that created it here. Durable resume is nominal.\n');
  process.exit(1);
}

console.log(`Deployed QIR durability gate passed — Run ${runId} was written by one worker and resumed by another, against the real journal.`);
