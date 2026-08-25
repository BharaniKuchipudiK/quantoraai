import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measuredOutcomeKey,
  compareByMeasuredOutcome,
  rankPublicDashboardModels,
  rankAdminDashboardModels,
} from '../../shared/model-dashboard-ranking.js';
import { overallOutcomeSignals } from '../../shared/model-outcome-routing.js';

function qrow(model_id, task_category, patch = {}) {
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

test('overallOutcomeSignals folds every task category into one per-model score', () => {
  const signals = overallOutcomeSignals([
    qrow('m/x', 'coding', { successful_responses: 8, failed_responses: 2 }),
    qrow('m/x', 'writing', { successful_responses: 10, failed_responses: 0 }),
  ]);
  const sig = signals.get('m/x');
  assert.equal(sig.sampleSize, 20); // 8+2+10+0 across categories
  assert.equal(sig.reliability, 18 / 20);
  assert.ok(sig.score > 50);
});

test('overallOutcomeSignals matches the old dashboard score formula', () => {
  // reliability 0.9, no feedback -> round(100 * (0.9*0.7 + 0.9*0.3)) = 90
  const sig = overallOutcomeSignals([
    qrow('m/x', 'coding', { successful_responses: 9, failed_responses: 1 }),
  ]).get('m/x');
  assert.equal(sig.score, 90);
});

test('measuredOutcomeKey trusts a score only past the sample bar', () => {
  assert.deepEqual(measuredOutcomeKey({ quality: { score: 90, sampleSize: 10 } }), { hasEvidence: true, score: 90 });
  assert.deepEqual(measuredOutcomeKey({ quality: { score: 90, sampleSize: 3 } }), { hasEvidence: false, score: -1 });
  assert.deepEqual(measuredOutcomeKey({ quality: null }), { hasEvidence: false, score: -1 });
  assert.deepEqual(measuredOutcomeKey({}), { hasEvidence: false, score: -1 });
});

test('compareByMeasuredOutcome puts proven ahead of untested, higher score first', () => {
  const good = { name: 'B', quality: { score: 95, sampleSize: 20 } };
  const ok = { name: 'A', quality: { score: 70, sampleSize: 20 } };
  const untested = { name: 'A', quality: null };
  assert.ok(compareByMeasuredOutcome(good, ok) < 0);
  assert.ok(compareByMeasuredOutcome(ok, untested) < 0);
  // Two untested models fall back to name order.
  assert.ok(compareByMeasuredOutcome({ name: 'A' }, { name: 'B' }) < 0);
});

test('public ranking keeps status/price buckets but sorts by outcome within them', () => {
  const models = [
    { id: 'free-weak', name: 'Zebra Free', status: 'available', pricingKind: 'free', quality: { score: 60, sampleSize: 20 } },
    { id: 'free-strong', name: 'Apple Free', status: 'available', pricingKind: 'free', quality: { score: 95, sampleSize: 20 } },
    { id: 'paid-strong', name: 'Paid Pro', status: 'available', pricingKind: 'paid', quality: { score: 99, sampleSize: 20 } },
  ];
  const ranked = rankPublicDashboardModels(models);
  // Free bucket (2) comes before paid bucket (3) regardless of score...
  assert.deepEqual(ranked.map((m) => m.id), ['free-strong', 'free-weak', 'paid-strong']);
});

test('public ranking floats the selected model to the very top', () => {
  const models = [
    { id: 'a', name: 'A', status: 'available', pricingKind: 'free', quality: { score: 99, sampleSize: 20 } },
    { id: 'b', name: 'B', status: 'available', pricingKind: 'paid', quality: { score: 10, sampleSize: 20 } },
  ];
  const ranked = rankPublicDashboardModels(models, { selectedModelId: 'b' });
  assert.equal(ranked[0].id, 'b');
});

test('untested models sort by name, after proven ones, in the same bucket', () => {
  const models = [
    { id: 'x', name: 'Xray', status: 'available', pricingKind: 'free' },
    { id: 'a', name: 'Alpha', status: 'available', pricingKind: 'free' },
    { id: 'p', name: 'Proven', status: 'available', pricingKind: 'free', quality: { score: 80, sampleSize: 20 } },
  ];
  assert.deepEqual(rankPublicDashboardModels(models).map((m) => m.id), ['p', 'a', 'x']);
});

test('admin ranking preserves category grouping and sorts by outcome within category', () => {
  const models = [
    { id: 'f1', name: 'Feat One', category: 'featured', quality: { score: 70, sampleSize: 20 } },
    { id: 'c1', name: 'Cand One', category: 'candidate', quality: { score: 99, sampleSize: 20 } },
    { id: 'f2', name: 'Feat Two', category: 'featured', quality: { score: 95, sampleSize: 20 } },
    { id: 'c2', name: 'Cand Two', category: 'candidate', quality: null },
  ];
  const ranked = rankAdminDashboardModels(models);
  // featured group (first seen) stays ahead of candidate group; within each, best first.
  assert.deepEqual(ranked.map((m) => m.id), ['f2', 'f1', 'c1', 'c2']);
});

test('rankers do not mutate their input', () => {
  const models = [
    { id: 'b', name: 'B', status: 'available', pricingKind: 'free', quality: { score: 10, sampleSize: 20 } },
    { id: 'a', name: 'A', status: 'available', pricingKind: 'free', quality: { score: 90, sampleSize: 20 } },
  ];
  const before = models.map((m) => m.id);
  rankPublicDashboardModels(models);
  rankAdminDashboardModels(models);
  assert.deepEqual(models.map((m) => m.id), before);
});
