#!/usr/bin/env node
/*
 * Deployed readiness gate — the deterministic half of the deployed goldens.
 *
 * WHY THIS IS SEPARATE FROM deployed-golden-transactions.mjs
 *
 * That script does two things with very different reliability. It asserts the
 * deployment is executable (a plain fetch — same answer every time), and then
 * drives a real browser through a real model turn (timing, rendering, live
 * providers — genuinely prone to flake). Both lived in one step, so when the
 * browser half misbehaved the step was marked continue-on-error and BOTH
 * halves went silent.
 *
 * The cost of that was measured, not imagined: on 2026-08-31 `api/domains.ts`
 * and `api/deploy.ts` shipped an import Node ESM cannot resolve. Custom-domain
 * connect, publish, and /api/inference-health were all dead in production. The
 * deployed gate DID detect it and threw the right error — and the job still
 * reported success, because the step that found it was muted.
 *
 * So the deterministic assertions live here, in a step that blocks. Nothing in
 * this file uses a browser, a model, or a paid provider call. If it fails, the
 * deployment is broken — there is no second interpretation to weigh.
 *
 * WHAT IT PROVES
 *
 * 1. /api/inference-health answers and reports ready — the router has a
 *    credential and a healthy provider.
 * 2. Every deployed function can be LOADED. A module-level crash (a bad
 *    import, a throwing top-level constant) kills a function before its
 *    handler runs, and Vercel answers FUNCTION_INVOCATION_FAILED. A 401, 405
 *    or 400 is a PASS here: the module loaded and the app made a decision.
 *    Only a platform-level crash fails this gate, which keeps it precise
 *    enough that nobody will ever be tempted to mute it.
 */
import process from 'node:process';
import { readdirSync } from 'node:fs';

const BASE_URL = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
const CANARY_TOKEN = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
const VERCEL_BYPASS_TOKEN = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');

if (!/^https:\/\//.test(BASE_URL)) throw new Error('QUANTORA_E2E_BASE_URL must be an HTTPS deployment URL.');

const headers = {
  'X-Quantora-Golden-Canary': CANARY_TOKEN,
  'x-vercel-protection-bypass': VERCEL_BYPASS_TOKEN,
};

const failures = [];

// ---- 1. Inference readiness -------------------------------------------------
let health = {};
let healthStatus = 0;
try {
  const response = await fetch(`${BASE_URL}/api/inference-health`, { headers });
  healthStatus = response.status;
  health = await response.json().catch(() => ({}));
  if (!response.ok || health.ready !== true) {
    failures.push(`/api/inference-health is not ready (HTTP ${healthStatus}): ${JSON.stringify(health).slice(0, 400)}`);
  }
} catch (error) {
  failures.push(`/api/inference-health could not be reached: ${error?.message || error}`);
}

// ---- 2. Every deployed function must load ----------------------------------
// Derived from the filesystem so a new function is covered the day it lands.
const functions = readdirSync('api', { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(ts|js)$/.test(entry.name))
  .map((entry) => entry.name.replace(/\.(ts|js)$/, ''))
  .sort();

// A module-load crash is a PLATFORM answer, never an application one.
const CRASH = /FUNCTION_INVOCATION_FAILED|ERR_MODULE_NOT_FOUND|Cannot find module|MIDDLEWARE_INVOCATION_FAILED/i;

for (const name of functions) {
  const url = `${BASE_URL}/api/${name}`;
  try {
    const response = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
    const vercelError = response.headers.get('x-vercel-error') || '';
    // Read the body only when the status could indicate a crash — a healthy
    // 401/405 needs no inspection.
    const body = response.status >= 500 ? (await response.text().catch(() => '')).slice(0, 600) : '';
    if (response.status >= 500 && (CRASH.test(vercelError) || CRASH.test(body))) {
      failures.push(`/api/${name} crashed before its handler ran (HTTP ${response.status}) — ${vercelError || body.replace(/\s+/g, ' ').slice(0, 200)}`);
    } else if (response.status >= 500) {
      // A 5xx without a crash signature is the app failing, not the module.
      // Report it so it is visible, but do not fail on it: this gate stays
      // precise so it is never worth muting.
      console.warn(`::warning::/api/${name} answered HTTP ${response.status} (module loaded; not a boot failure)`);
    }
  } catch (error) {
    failures.push(`/api/${name} could not be reached: ${error?.message || error}`);
  }
}

if (failures.length) {
  console.error(`\nDeployed readiness gate FAILED against ${BASE_URL}\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('\nThis deployment is broken. Do not merge or promote it.\n');
  process.exit(1);
}

console.log(`Deployed readiness gate passed — inference ready, ${functions.length} function(s) boot cleanly.`);
