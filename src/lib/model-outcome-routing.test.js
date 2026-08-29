import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_OUTCOME_SAMPLES,
  MAX_OUTCOME_ADJUST,
  outcomeSignalsForTask,
  outcomeRoutingAdjust,
  withOutcomeSignals,
} from '../../shared/model-outcome-routing.js';
import { resolveCodingDeskModel } from './coding-desk-auto-model.js';

function row(model_id, task_category, patch = {}) {
  return {
    model_id,
    task_category,
    successful_responses: 0,
    failed_responses: 0,
    helpful_votes: 0,
    not_helpful_votes: 0,
    fallback_rescues: 0,
    avg_latency_ms: 0,
    ...patch,
  };
}

test('no rows yields an empty signal map (fail-safe)', () => {
  assert.equal(outcomeSignalsForTask([], 'coding').size, 0);
  assert.equal(outcomeSignalsForTask(null, 'coding').size, 0);
  assert.equal(outcomeSignalsForTask(undefined).size, 0);
});

test('below the trust bar the score stays null and the adjustment is 0', () => {
  const signals = outcomeSignalsForTask(
    [row('m/x', 'coding', { successful_responses: 3, failed_responses: 1 })],
    'coding',
  );
  const sig = signals.get('m/x');
  assert.equal(sig.sampleSize, 4);
  assert.equal(sig.score, null);
  assert.equal(outcomeRoutingAdjust(sig), 0);
});

test('a reliable model earns a positive, sample-weighted adjustment', () => {
  const light = outcomeSignalsForTask(
    [row('m/good', 'coding', { successful_responses: 5, failed_responses: 0 })],
    'coding',
  ).get('m/good');
  const heavy = outcomeSignalsForTask(
    [row('m/good', 'coding', { successful_responses: 40, failed_responses: 0 })],
    'coding',
  ).get('m/good');

  assert.equal(light.sampleSize, MIN_OUTCOME_SAMPLES);
  assert.ok(outcomeRoutingAdjust(light) > 0);
  // More evidence at the same reliability moves routing further.
  assert.ok(outcomeRoutingAdjust(heavy) > outcomeRoutingAdjust(light));
  assert.ok(outcomeRoutingAdjust(heavy) <= MAX_OUTCOME_ADJUST);
});

test('a failing model earns a negative adjustment, bounded', () => {
  const bad = outcomeSignalsForTask(
    [row('m/bad', 'coding', { successful_responses: 1, failed_responses: 39 })],
    'coding',
  ).get('m/bad');
  const adj = outcomeRoutingAdjust(bad);
  assert.ok(adj < 0);
  assert.ok(adj >= -MAX_OUTCOME_ADJUST);
});

test('exact task category is preferred once it clears the trust bar', () => {
  const rows = [
    // Strong coding history, weak everywhere-else aggregate.
    row('m/coder', 'coding', { successful_responses: 20, failed_responses: 0 }),
    row('m/coder', 'writing', { successful_responses: 0, failed_responses: 20 }),
  ];
  const sig = outcomeSignalsForTask(rows, 'coding').get('m/coder');
  // Uses the coding rows only, not the polluted whole-catalog aggregate.
  assert.equal(sig.sampleSize, 20);
  assert.equal(sig.reliability, 1);
});

test('falls back to the whole-catalog aggregate when the category is sparse', () => {
  const rows = [
    row('m/x', 'coding', { successful_responses: 1, failed_responses: 0 }), // below bar for coding
    row('m/x', 'writing', { successful_responses: 30, failed_responses: 0 }),
  ];
  const sig = outcomeSignalsForTask(rows, 'coding').get('m/x');
  // Category-specific data is too thin, so the broad aggregate (31 samples) is used.
  assert.equal(sig.sampleSize, 31);
});

test('withOutcomeSignals attaches quality without mutating inputs', () => {
  const models = [{ id: 'm/a' }, { id: 'm/b' }, { notAModel: true }];
  const signals = outcomeSignalsForTask(
    [row('m/a', 'coding', { successful_responses: 10, failed_responses: 0 })],
    'coding',
  );
  const decorated = withOutcomeSignals(models, signals);
  assert.equal(decorated[0].quality.score, 100);
  assert.equal(decorated[1].quality, undefined); // no evidence -> untouched
  assert.equal(models[0].quality, undefined); // original not mutated
});

test('empty signal map passes models through unchanged', () => {
  const models = [{ id: 'm/a' }];
  assert.equal(withOutcomeSignals(models, new Map()), models);
});

test('measured failure demotes a name-strong coder below a proven plain model', () => {
  const available = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
    // Name says "coder" (+48) but it has been failing hard in production.
    {
      id: 'flaky/coder-13b:free',
      name: 'Flaky Coder 13B',
      available: true,
      pricingKind: 'free',
      specialty: 'code synthesis',
      quality: { sampleSize: 40, score: 5 },
    },
    // A plain free model with no "coder" cachet but a strong measured record.
    {
      id: 'reliable/mixtral:free',
      name: 'Reliable Mixtral',
      available: true,
      pricingKind: 'free',
      specialty: 'general assistant',
      quality: { sampleSize: 40, score: 98 },
    },
  ];
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Refactor the entire codebase into modules', // forces escalation
    availableModels: available,
    refineMode: true,
  });
  assert.equal(choice.escalated, true);
  assert.equal(choice.modelId, 'reliable/mixtral:free');
});
