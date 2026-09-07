/**
 * Latency breaks ties, moves only routes that have been measured, and may never
 * do anything else.
 *
 * Phase 6 routes on "capability + measured outcome + health + latency + cost +
 * budget". Latency was the input the platform collected and then dropped:
 * `model_quality_events` records it per turn, `avgLatencyMs` rides on every
 * signal, and nothing read it. Both rankers meanwhile broke ties on catalogue
 * position, an accident of list order standing in for a decision.
 *
 * There are two ways to get this wrong and both are quiet.
 *
 * Overcorrect and a fast wrong answer beats a slow right one, which shows up as
 * "it got dumber" with nothing failing anywhere.
 *
 * Or reorder on evidence that does not exist. The first version of this scored
 * each route and gave an unmeasured one a zero, which sits in the middle of the
 * measured range -- so it was treated as faster than every slow route and
 * slower than every fast one, on no evidence at all. Review of #590 caught it,
 * and the last three tests here are the ones that would have.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_OUTCOME_SAMPLES,
  overallOutcomeSignals,
  settleLatencyTies,
  trustedLatencyMs,
} from '../../shared/model-outcome-routing.js';
import { rankCodingDeskFallbacks } from './coding-desk-auto-model.js';

const TRUSTED = MIN_OUTCOME_SAMPLES + 4;

function model(id, { latency = null, samples = TRUSTED } = {}) {
  return {
    id,
    name: id,
    // is_free is the field isFreeReady actually reads; a fixture that sets the
    // wrong one silently empties the pool and the test passes for no reason.
    is_free: true,
    quality: latency === null ? undefined : { sampleSize: samples, avgLatencyMs: latency, score: 60 },
  };
}

const entry = (m, index, score) => ({ model: m, index, score });
const ids = (list) => list.map((e) => e.model.id);

test('a measured route needs both a trusted sample and a real latency', () => {
  assert.equal(trustedLatencyMs(model('a', { latency: 1200 })), 1200);
  assert.equal(trustedLatencyMs(model('a', { latency: 1200, samples: MIN_OUTCOME_SAMPLES - 1 })), null);
  assert.equal(trustedLatencyMs(model('a')), null, 'no evidence at all');
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(trustedLatencyMs(model('a', { latency: bad })), null, `${bad} is not a measurement`);
  }
});

test('tied routes are reordered fastest first', () => {
  const settled = settleLatencyTies([
    entry(model('slow', { latency: 9000 }), 0, 10),
    entry(model('quick', { latency: 1000 }), 1, 10),
    entry(model('middle', { latency: 5000 }), 2, 10),
  ]);
  assert.deepEqual(ids(settled), ['quick', 'middle', 'slow']);
});

/*
 * Merit is what the runs are made of, so latency cannot cross one. This is now
 * true by construction rather than by an arithmetic bound that had to be argued.
 */
test('a difference in merit is never overturned, however large the speed gap', () => {
  const settled = settleLatencyTies([
    entry(model('better-but-slow', { latency: 30000 }), 0, 40),
    entry(model('worse-but-instant', { latency: 5 }), 1, 39),
  ]);
  assert.deepEqual(ids(settled), ['better-but-slow', 'worse-but-instant'], 'one point of merit still decides');
});

/*
 * THE FINDING FROM REVIEW OF #590.
 *
 * An unmeasured route sat at the midpoint of the measured range and was
 * silently ranked ahead of every slow route and behind every fast one, on
 * nothing. It must not move, and nothing may move past it on its own account.
 */
test('a route with no latency evidence keeps its position exactly', () => {
  const settled = settleLatencyTies([
    entry(model('slow', { latency: 9000 }), 0, 10),
    entry(model('unknown'), 1, 10),
    entry(model('fast', { latency: 1000 }), 2, 10),
  ]);
  assert.equal(ids(settled)[1], 'unknown', 'the unmeasured route stays exactly where merit and catalogue order put it');
  assert.deepEqual(ids(settled), ['fast', 'unknown', 'slow'], 'only the two measured routes trade places');
});

test('one measured route among unmeasured ones changes nothing', () => {
  const settled = settleLatencyTies([
    entry(model('a'), 0, 10),
    entry(model('lonely', { latency: 50 }), 1, 10),
    entry(model('c'), 2, 10),
  ]);
  assert.deepEqual(ids(settled), ['a', 'lonely', 'c'], 'a route with nobody comparable to race has won nothing');
});

test('an untrusted sample does not get to move anything', () => {
  const settled = settleLatencyTies([
    entry(model('proven-slow', { latency: 8000 }), 0, 10),
    entry(model('hunch', { latency: 5, samples: MIN_OUTCOME_SAMPLES - 1 }), 1, 10),
    entry(model('proven-fast', { latency: 2000 }), 2, 10),
  ]);
  assert.equal(ids(settled)[1], 'hunch', 'a one-turn fluke must not outrank measured evidence');
  assert.deepEqual(ids(settled), ['proven-fast', 'hunch', 'proven-slow']);
});

test('equally fast routes keep catalogue order rather than inventing one', () => {
  const settled = settleLatencyTies([
    entry(model('first', { latency: 2000 }), 0, 10),
    entry(model('second', { latency: 2000 }), 1, 10),
  ]);
  assert.deepEqual(ids(settled), ['first', 'second']);
});

test('a cold catalogue is returned untouched', () => {
  const cold = [entry(model('a'), 0, 10), entry(model('b'), 1, 10)];
  assert.deepEqual(ids(settleLatencyTies(cold)), ['a', 'b']);
  assert.deepEqual(settleLatencyTies([]), []);
  assert.deepEqual(settleLatencyTies(null), []);
});

test('routes are not moved between different merit runs', () => {
  const settled = settleLatencyTies([
    entry(model('topslow', { latency: 9000 }), 0, 20),
    entry(model('topfast', { latency: 100 }), 1, 20),
    entry(model('lowfast', { latency: 1 }), 2, 5),
  ]);
  assert.deepEqual(ids(settled), ['topfast', 'topslow', 'lowfast'], 'the faster low-merit route stays below both');
});

/*
 * The wiring: the ordering above is worthless if no ranker applies it. Run in
 * both directions, so a pass cannot be an accident of the catalogue order this
 * replaces.
 */
test('the failover order uses it, and follows the evidence when the evidence flips', () => {
  const first = rankCodingDeskFallbacks(
    [model('alpha', { latency: 1200 }), model('beta', { latency: 9000 })],
    { primaryId: 'none', allowPaid: false },
  );
  assert.ok(first.indexOf('alpha') < first.indexOf('beta'), `expected the faster route first, got ${first.join(' > ')}`);

  const flipped = rankCodingDeskFallbacks(
    [model('alpha', { latency: 9000 }), model('beta', { latency: 1200 })],
    { primaryId: 'none', allowPaid: false },
  );
  assert.ok(
    flipped.indexOf('beta') < flipped.indexOf('alpha'),
    `the order did not follow the measured latency, got ${flipped.join(' > ')}; catalogue position is still deciding`,
  );
});

/*
 * ALSO FROM REVIEW OF #590: the number being compared has to be the real one.
 *
 * The view computes avg_latency_ms over successful rows only, so combining a
 * model's categories unweighted lets one sample outvote a hundred. Harmless
 * while nothing read it; routing on it is what made the weight matter.
 */
test('latency across categories is weighted by the calls each average covers', () => {
  const signals = overallOutcomeSignals([
    { model_id: 'm', task_category: 'coding', successful_responses: 1, failed_responses: 0, avg_latency_ms: 100 },
    { model_id: 'm', task_category: 'writing', successful_responses: 100, failed_responses: 0, avg_latency_ms: 1000 },
  ]);
  const avg = signals.get('m').avgLatencyMs;
  assert.equal(avg, 991, `unweighted would read 550 and rank this model ahead of a genuinely faster one; got ${avg}`);
});

test('a category with no successes cannot drag the average', () => {
  const signals = overallOutcomeSignals([
    { model_id: 'm', task_category: 'coding', successful_responses: 10, failed_responses: 0, avg_latency_ms: 500 },
    { model_id: 'm', task_category: 'writing', successful_responses: 0, failed_responses: 4, avg_latency_ms: 0 },
  ]);
  assert.equal(signals.get('m').avgLatencyMs, 500, 'a row whose average covers no successful call is not evidence');
});
