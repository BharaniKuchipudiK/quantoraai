import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEASURED_MIN_SAMPLES,
  MEASURED_WINDOW_MS,
  isMeasuredPoor,
  rankByMeasuredOutcome,
  readMeasuredOutcomes,
  summarizeModelQuality,
} from './measured-outcome.js';

/*
 * QIR Phase 6 — the ledger is read, not only written.
 *
 * model_quality_events had one row per finished turn since the phase opened
 * and nothing consulted it: a model failing six of eight recent turns was
 * tried first as long as its circuit was closed. These tests pin the signal's
 * shape and its restraint — it demotes only on unambiguous evidence, never
 * removes a route, never promotes a paid rung, and does nothing without
 * evidence.
 */

const NOW = Date.parse('2026-09-06T12:00:00Z');
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const row = (model_id: string, outcome: string, minutesAgo: number, latency_ms: number | null = 900) => ({ model_id, outcome, latency_ms, created_at: at(minutesAgo) });

test('the summary counts success and failure inside the window, with a median latency', () => {
  const summary = summarizeModelQuality([
    row('a', 'success', 1, 400), row('a', 'failure', 2, 1200), row('a', 'success', 3, 800),
    row('a', 'success', 45, 100), // outside the 30-minute window
    row('a', 'helpful', 1, 50), row('a', 'not_helpful', 1, 50), // opinions, not measurements
    row('b', 'failure', 5, null),
  ], { now: NOW });
  assert.deepEqual(summary.a, { modelId: 'a', samples: 3, successes: 2, failures: 1, failureRate: 1 / 3, p50LatencyMs: 800 });
  assert.deepEqual(summary.b, { modelId: 'b', samples: 1, successes: 0, failures: 1, failureRate: 1, p50LatencyMs: null });
  assert.equal(MEASURED_WINDOW_MS, 30 * 60_000);
});

test('a row with no readable time counts: a missing timestamp is a store fault, not missing evidence', () => {
  const summary = summarizeModelQuality([{ model_id: 'a', outcome: 'failure' }, { model_id: 'a', outcome: 'failure', created_at: 'garbage' }], { now: NOW });
  assert.equal(summary.a.failures, 2);
});

test('poor means enough turns AND most of them failed — never one bad turn, never a busy healthy model', () => {
  const failing = summarizeModelQuality(Array.from({ length: 8 }, (_, i) => row('m', i < 6 ? 'failure' : 'success', i)), { now: NOW }).m;
  assert.equal(isMeasuredPoor(failing), true, '6 of 8 failed');
  const oneBad = summarizeModelQuality([row('m', 'failure', 1)], { now: NOW }).m;
  assert.equal(isMeasuredPoor(oneBad), false, 'one failure is not evidence');
  const busyHealthy = summarizeModelQuality(Array.from({ length: 40 }, (_, i) => row('m', i % 5 === 0 ? 'failure' : 'success', i % 29)), { now: NOW }).m;
  assert.equal(isMeasuredPoor(busyHealthy), false, '20% failures on a busy model is not poor');
  assert.equal(isMeasuredPoor(undefined), false);
  assert.equal(MEASURED_MIN_SAMPLES, 5);
});

test('ranking moves a poorly measured route behind the others, stably, and marks why', () => {
  const routes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const measured = summarizeModelQuality([
    ...Array.from({ length: 6 }, (_, i) => row('a', i < 5 ? 'failure' : 'success', i)),
    row('c', 'success', 1),
  ], { now: NOW });
  const ranked = rankByMeasuredOutcome(routes, measured);
  assert.deepEqual(ranked.map((r) => r.id), ['b', 'c', 'a']);
  assert.equal(ranked[2].demoted, 'measured-outcome');
  assert.equal(ranked[2].measured?.failures, 5);
  assert.equal(ranked[1].measured?.samples, 1, 'evidence rides along even when it does not move a route');
  assert.equal(ranked[0].demoted, undefined);
  assert.equal(ranked.length, 3, 'nothing is removed');
});

test('no evidence changes nothing, and a paid rescue rung stays last whatever was measured', () => {
  const routes = [{ id: 'a' }, { id: 'b' }, { id: 'paid', paid: true }];
  assert.deepEqual(rankByMeasuredOutcome(routes, {}).map((r) => r.id), ['a', 'b', 'paid']);
  assert.deepEqual(rankByMeasuredOutcome(routes, undefined).map((r) => r.id), ['a', 'b', 'paid']);
  const bothPoor = summarizeModelQuality([
    ...Array.from({ length: 5 }, (_, i) => row('a', 'failure', i)),
    ...Array.from({ length: 5 }, (_, i) => row('b', 'failure', i)),
    ...Array.from({ length: 5 }, (_, i) => row('paid', 'success', i)),
  ], { now: NOW });
  assert.deepEqual(rankByMeasuredOutcome(routes, bothPoor).map((r) => r.id), ['a', 'b', 'paid'], 'the paid rung is never promoted');
});

test('the live reader caches for a minute and reads as no evidence on any fault', async () => {
  let calls = 0;
  const asked: string[] = [];
  const load = async (sinceIso: string) => {
    calls += 1;
    asked.push(sinceIso);
    return [row('a', 'failure', 1)];
  };
  const first = await readMeasuredOutcomes(load, { now: NOW });
  const second = await readMeasuredOutcomes(load, { now: NOW + 30_000 });
  assert.equal(calls, 1, 'the second read inside the minute came from the cache');
  assert.equal(second.a.failures, 1);
  assert.equal(first, second);
  const third = await readMeasuredOutcomes(load, { now: NOW + 61_000 });
  assert.equal(calls, 2, 'and the cache expires');
  assert.deepEqual(asked, [new Date(NOW - MEASURED_WINDOW_MS).toISOString(), new Date(NOW + 61_000 - MEASURED_WINDOW_MS).toISOString()], 'each read asks the store for exactly its window');
  assert.equal(third.a.samples, 1);

  // cacheMs 0 bypasses the cache — the only way a test needs to, so no reset hook.
  const failing = await readMeasuredOutcomes(async () => { throw new Error('store down'); }, { now: NOW, cacheMs: 0 });
  assert.deepEqual(failing, {}, 'a store fault is no evidence, never a failed turn');
});
