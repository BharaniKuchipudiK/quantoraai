import test from 'node:test';
import assert from 'node:assert/strict';
import { engineRefusalStopsRun, REFUSAL_STATUSES } from './lib/golden-engine-refusal.mjs';

const ok = { httpStatus: 200, ok: true, status: null };
const spendCap = { httpStatus: 200, ok: false, status: 403 };
const depleted = { httpStatus: 200, ok: false, status: 429 };
const production = { openRouterConfigured: true, openRouterCredentialRefused: false, routeCount: 2 };
const preview = { openRouterConfigured: false, openRouterCredentialRefused: false, routeCount: 1 };

test('a healthy engine never stops the run', () => {
  const decision = engineRefusalStopsRun(ok, preview);
  assert.deepEqual(decision, { refused: false, stop: false, fallback: null, reason: null });
});

test('a refusal on a preview — Gemini is the only engine — stops before the first turn', () => {
  const decision = engineRefusalStopsRun(depleted, preview);
  assert.equal(decision.refused, true);
  assert.equal(decision.stop, true);
  assert.equal(decision.fallback, null);
  assert.match(decision.reason, /no OpenRouter credential is configured/);
});

test('a refusal on production — a second engine the planner can reach — lets the transactions run on the fallback', () => {
  // 2026-09-06 00:23 UTC: calculator, simple-website and guided-intake passed
  // on OpenRouter while Gemini answered "403: Spend cap breached".
  const decision = engineRefusalStopsRun(spendCap, production);
  assert.equal(decision.refused, true);
  assert.equal(decision.stop, false);
  assert.equal(decision.fallback, 'openrouter');
  assert.match(decision.reason, /run on the fallback engine/);
});

test('a refused OpenRouter credential is not a fallback (2026-09-04: a key that exists and answers 401)', () => {
  const decision = engineRefusalStopsRun(spendCap, { openRouterConfigured: true, openRouterCredentialRefused: true, routeCount: 1 });
  assert.equal(decision.stop, true);
  assert.match(decision.reason, /refused by the gateway/);
});

test('a configured OpenRouter key the planner offers no route on is not a fallback either', () => {
  // The paid-route brake can leave a present, valid key with nothing runnable.
  const decision = engineRefusalStopsRun(spendCap, { openRouterConfigured: true, openRouterCredentialRefused: false, routeCount: 1 });
  assert.equal(decision.stop, true);
  assert.match(decision.reason, /offers 1 route\(s\), none beyond the refused engine/);
});

test('anything less unambiguous than a refusal is recorded, not fatal — a missing model, an unreachable probe', () => {
  assert.equal(engineRefusalStopsRun({ httpStatus: 200, ok: false, status: 404 }, preview).stop, false);
  assert.equal(engineRefusalStopsRun({ httpStatus: null, ok: false, status: null }, preview).stop, false);
  assert.equal(engineRefusalStopsRun({ httpStatus: 500, ok: false, status: 403 }, preview).stop, false, 'the probe endpoint itself failing is not the engine refusing');
  assert.equal(engineRefusalStopsRun(undefined, undefined).stop, false);
});

test('the refusal statuses are exactly the credential-level ones', () => {
  assert.deepEqual([...REFUSAL_STATUSES], [401, 403, 429]);
  for (const status of REFUSAL_STATUSES) {
    assert.equal(engineRefusalStopsRun({ httpStatus: 200, ok: false, status: String(status) }, preview).stop, true, `status ${status} as a string still counts`);
  }
});
