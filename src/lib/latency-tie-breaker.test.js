/**
 * Latency breaks ties, and may never do anything else.
 *
 * Phase 6 routes on "capability + measured outcome + health + latency + cost +
 * budget". Latency was the input the platform collected and then dropped:
 * `model_quality_events` records it per turn, `avgLatencyMs` rides on every
 * signal, and nothing read it. Meanwhile both rankers already broke ties, on
 * `a.index - b.index` — catalogue position, an accident of list order standing
 * in for a decision.
 *
 * The danger in fixing that is overcorrection. A latency term with real weight
 * makes a fast wrong answer beat a slow right one, which is the worst trade
 * available on a build turn and would show up as "it got dumber" with no
 * failing test anywhere. So the guarantee is arithmetic, not a judgement call
 * about a small-looking weight, and this file proves it by exhaustion rather
 * than asserting it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LATENCY_TIE_BREAK,
  MIN_OUTCOME_SAMPLES,
  latencyTieBreaks,
} from '../../shared/model-outcome-routing.js';
import { rankCodingDeskFallbacks } from './coding-desk-auto-model.js';

const TRUSTED = MIN_OUTCOME_SAMPLES + 4;

function model(id, { latency = null, samples = TRUSTED, ...rest } = {}) {
  return {
    id,
    name: id,
    // is_free is the field isFreeReady actually reads; `free` is not one of
    // them, and a fixture that sets the wrong field silently empties the pool.
    is_free: true,
    quality: latency === null ? undefined : { sampleSize: samples, avgLatencyMs: latency, score: 60 },
    ...rest,
  };
}

/*
 * THE PROPERTY THE WHOLE DESIGN RESTS ON.
 *
 * Every other term in both routing scores is an integer, so two routes that
 * differ on merit differ by at least 1. A tie-break bounded strictly under a
 * half cannot close that gap from either side. If someone raises the bound to
 * 0.5 "to make it matter more", this is the test that catches it, because at
 * exactly 0.5 two adjacent merits become reorderable.
 */
test('the bound is strictly under a half, which is what makes it a tie-break and not a ranker', () => {
  assert.ok(MAX_LATENCY_TIE_BREAK < 0.5, `${MAX_LATENCY_TIE_BREAK} would let latency overturn a difference in merit`);
  assert.ok(MAX_LATENCY_TIE_BREAK > 0, 'a tie-break that is always zero breaks no ties');
});

test('no measured latency can move a route by half a point or more', () => {
  // Spans chosen to hit the extremes and the awkward shapes between them.
  const spans = [[1, 2], [1, 100000], [999, 1000], [50, 50.5], [1, 3, 7, 19, 250, 4000]];
  for (const latencies of spans) {
    const breaks = latencyTieBreaks(latencies.map((ms, i) => model(`m${i}`, { latency: ms })));
    for (const [id, value] of breaks) {
      assert.ok(
        Math.abs(value) <= MAX_LATENCY_TIE_BREAK,
        `${id} moved by ${value}, outside the bound that keeps merit decisive`,
      );
      assert.ok(Math.abs(value) < 0.5, `${id} moved by ${value}, which can overturn a difference in merit`);
    }
  }
});

test('a difference in merit is never overturned, for every merit gap and every tie-break pair', () => {
  const extremes = [-MAX_LATENCY_TIE_BREAK, -0.3, -0.0001, 0, 0.0001, 0.3, MAX_LATENCY_TIE_BREAK];
  for (let better = -40; better <= 40; better += 1) {
    for (const gap of [1, 2, 7, 30]) {
      const worse = better - gap;
      for (const breakBetter of extremes) {
        for (const breakWorse of extremes) {
          const scoredBetter = better + breakBetter;
          const scoredWorse = worse + breakWorse;
          assert.ok(
            scoredBetter > scoredWorse,
            `merit ${better} fell behind merit ${worse} once latency was applied `
            + `(${scoredBetter} vs ${scoredWorse}); the tie-break has become a ranker`,
          );
        }
      }
    }
  }
});

test('the fastest proven route takes the positive edge and the slowest the negative one', () => {
  const breaks = latencyTieBreaks([
    model('slow', { latency: 9000 }),
    model('quick', { latency: 1000 }),
    model('middle', { latency: 5000 }),
  ]);
  assert.equal(breaks.get('quick'), MAX_LATENCY_TIE_BREAK);
  assert.equal(breaks.get('slow'), -MAX_LATENCY_TIE_BREAK);
  assert.equal(breaks.get('middle'), 0, 'the midpoint of the span is neutral');
  assert.ok(breaks.get('quick') > breaks.get('middle'));
  assert.ok(breaks.get('middle') > breaks.get('slow'));
});

/*
 * Fail-safe, the property this whole module family is built on: with no
 * evidence the router must behave exactly as it did the day before.
 */
test('nothing to compare leaves the order exactly as it was', () => {
  assert.equal(latencyTieBreaks([]).size, 0, 'an empty pool');
  assert.equal(latencyTieBreaks(null).size, 0, 'not a pool at all');
  assert.equal(
    latencyTieBreaks([model('only', { latency: 1000 })]).size,
    0,
    'one measured route has nobody to be faster than',
  );
  assert.equal(
    latencyTieBreaks([model('a'), model('b')]).size,
    0,
    'a cold catalogue must route identically to before this existed',
  );
  assert.equal(
    latencyTieBreaks([model('a', { latency: 2000 }), model('b', { latency: 2000 })]).size,
    0,
    'equally fast is a tie on latency too, and inventing an order would be a guess',
  );
});

test('an untrusted sample does not get to break anything', () => {
  const breaks = latencyTieBreaks([
    model('proven', { latency: 8000 }),
    model('hunch', { latency: 5, samples: MIN_OUTCOME_SAMPLES - 1 }),
    model('alsoproven', { latency: 2000 }),
  ]);
  assert.equal(breaks.has('hunch'), false, 'a one-turn fluke must not outrank measured evidence');
  assert.equal(breaks.get('alsoproven'), MAX_LATENCY_TIE_BREAK, 'the fastest TRUSTED route is the fastest');
});

test('a latency that is absent, zero or nonsense is not evidence', () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null]) {
    const breaks = latencyTieBreaks([model('bad', { latency: bad }), model('good', { latency: 1000 })]);
    assert.equal(breaks.has('bad'), false, `${bad} must not be read as a measured latency`);
  }
});

/*
 * The wiring, not the arithmetic: the map above is worthless if no ranker adds
 * it. Two routes identical in every input the scorer reads, differing only in
 * measured latency — and reversed, so a passing test cannot be an accident of
 * catalogue order, which is the very thing being replaced.
 */
test('the failover order actually uses it, and follows the evidence when the evidence flips', () => {
  const build = (fastId, slowId) => [
    model(fastId, { latency: 1200 }),
    model(slowId, { latency: 9000 }),
  ];

  const first = rankCodingDeskFallbacks(build('alpha', 'beta'), { primaryId: 'none', allowPaid: false });
  assert.ok(first.indexOf('alpha') < first.indexOf('beta'), `expected the faster route first, got ${first.join(' > ')}`);

  // Same catalogue order, opposite evidence. If catalogue position were still
  // deciding, this would come back in the same order as above.
  const flipped = rankCodingDeskFallbacks(
    [model('alpha', { latency: 9000 }), model('beta', { latency: 1200 })],
    { primaryId: 'none', allowPaid: false },
  );
  assert.ok(
    flipped.indexOf('beta') < flipped.indexOf('alpha'),
    `the order did not follow the measured latency, got ${flipped.join(' > ')}; catalogue position is still deciding`,
  );
});
