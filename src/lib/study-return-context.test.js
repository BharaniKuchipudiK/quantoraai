import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStudyReturnContext } from './study-return-context.js';
const asOf = '2026-09-10T12:00:00.000Z';
function entry(overrides = {}) {
  return { concept: { id: 'id', canonicalKey: 'motion.graphs', label: 'Motion graphs' },
    projection: { conceptId: 'id', conceptKey: 'motion.graphs', evidenceCount: 2, observedThrough: '2026-09-09T12:00:00Z',
      learnerModel: { understanding: { state: 'verified' }, misconception: { state: 'needs_confirmation' },
        retention: { due: true, dueAt: '2026-09-10T00:00:00Z' }, nextLearningMove: { type: 'confirm_misconception' } }, ...overrides } };
}
test('fresh canonical projections produce separate recent, misconception and retention summaries', () => {
  const result = summarizeStudyReturnContext([entry()], { asOf });
  assert.equal(result.recentMastery.length, 1); assert.equal(result.unresolvedMisconceptions.length, 1);
  assert.equal(result.unresolvedMisconceptions[0].state, 'needs_confirmation');
  assert.equal(result.retentionDue.length, 1); assert.equal(result.coverage, 'complete');
});
test('browser checkpoint fields, absent evidence, future dates and mismatched concepts are not history', () => {
  for (const value of [entry({ evidenceCount: 0 }), entry({ conceptId: 'forged' }), entry({ conceptKey: 'forged' }), entry({ observedThrough: '2027-01-01' }), { checkpoint: { mastery: 1, phase: 'review' } }]) {
    const result = summarizeStudyReturnContext([value], { asOf });
    assert.equal(result.observedConcepts, 0); assert.deepEqual(result.recentMastery, []);
  }
});
test('old verified evidence is not labelled recent and future retention is not due', () => {
  const old = entry({ observedThrough: '2026-08-01T00:00:00Z' });
  old.projection.learnerModel.retention.dueAt = '2026-09-11T00:00:00Z';
  const result = summarizeStudyReturnContext([old], { asOf });
  assert.deepEqual(result.recentMastery, []); assert.deepEqual(result.retentionDue, []);
});
test('partial refresh is never advertised as complete empty history', () => {
  assert.equal(summarizeStudyReturnContext([], { asOf, partial: true }).coverage, 'partial');
  assert.equal(summarizeStudyReturnContext([], { asOf: 'invalid' }), null);
});
