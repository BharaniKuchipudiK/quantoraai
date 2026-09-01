import assert from 'node:assert/strict';
import test from 'node:test';
import { replayStudyLearnerProjection } from './study-learner-projection.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

function evidence(index: number, observedAt: string): StudyMasteryEvidenceEvent {
  return {
    id: `projection-event-${index}`,
    conceptId: 'concept-projection',
    kind: 'teach_back',
    correct: true,
    score: 1,
    difficulty: 0.5,
    hintsUsed: 0,
    responseMs: 1200,
    selfConfidence: null,
    independent: true,
    misconceptionSignal: false,
    delayDays: null,
    provenance: 'quantora_authored',
    sourceRef: 'quantora:test:projection',
    assessmentRef: null,
    itemRef: null,
    observedAt,
  };
}

const replayAt = '2026-09-02T00:00:00.000Z';

test('H3.1 replay is deterministic for the same admitted ledger and clock', () => {
  const events = [
    evidence(1, '2026-08-31T00:00:00.000Z'),
    evidence(2, '2026-09-01T00:00:00.000Z'),
  ];
  const left = replayStudyLearnerProjection({
    conceptId: 'concept-projection',
    conceptKey: 'physics.kinematics.motion-graphs',
    evidence: events,
    asOf: replayAt,
  });
  const right = replayStudyLearnerProjection({
    conceptId: 'concept-projection',
    conceptKey: 'physics.kinematics.motion-graphs',
    evidence: [...events].reverse(),
    asOf: replayAt,
  });

  assert.deepEqual(left, right);
  assert.equal(left.observedThrough, '2026-09-01T00:00:00.000Z');
  assert.deepEqual(left.evidenceKinds, ['teach_back']);
  assert.ok(left.schemaVersion.startsWith('study-learner-projection-'));
  assert.ok(left.learnerModelVersion.startsWith('study-learner-model-'));
  assert.ok(left.estimatorVersion.startsWith('study-mastery-estimator-'));
});

test('H3.1 replay changes when admitted learner truth changes', () => {
  const base = replayStudyLearnerProjection({
    conceptId: 'concept-projection',
    conceptKey: 'physics.kinematics.motion-graphs',
    evidence: [evidence(1, '2026-09-01T00:00:00.000Z')],
    asOf: replayAt,
  });
  const changed = replayStudyLearnerProjection({
    conceptId: 'concept-projection',
    conceptKey: 'physics.kinematics.motion-graphs',
    evidence: [
      evidence(1, '2026-09-01T00:00:00.000Z'),
      evidence(2, '2026-09-01T01:00:00.000Z'),
    ],
    asOf: replayAt,
  });
  assert.notDeepEqual(base, changed);
  assert.notEqual(base.evidenceCount, changed.evidenceCount);
});

test('H3.1 replay rejects an invalid clock instead of silently using wall time', () => {
  assert.throws(() => replayStudyLearnerProjection({
    conceptId: 'concept-projection',
    conceptKey: 'physics.kinematics.motion-graphs',
    evidence: [],
    asOf: 'not-a-date',
  }), /study_projection_invalid_as_of/);
});
