import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import { replayStudyLearnerProjection, type StudyLearnerProjection } from './study-learner-projection.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const CONCEPT_ID = 'concept-projection';
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';

function evidence(input: {
  index: number;
  observedAt: string;
  itemKey: 'motion-graphs-velocity-slope' | 'motion-graphs-acceleration-slope';
  correct?: boolean;
}): StudyMasteryEvidenceEvent {
  const item = findStudyAssessmentItem(input.itemKey, '1');
  assert.ok(item);
  const attemptId = `10000000-0000-4000-8000-${String(input.index).padStart(12, '0')}`;
  const correct = input.correct !== false;
  const submittedOptionId = correct
    ? item.correctOptionId
    : item.options.find((option) => option.id !== item.correctOptionId)?.id;
  assert.ok(submittedOptionId);

  const row: StudyMasteryEvidenceEvent = {
    id: `study.assessment.${attemptId}`,
    conceptId: CONCEPT_ID,
    kind: 'assessment_item',
    correct,
    score: correct ? 1 : 0,
    difficulty: item.difficulty,
    hintsUsed: 0,
    responseMs: 1200,
    selfConfidence: null,
    independent: true,
    misconceptionSignal: false,
    delayDays: null,
    provenance: 'quantora_authored',
    sourceRef: 'quantora:study-assessment-bank',
    assessmentRef: `attempt:${attemptId}`,
    itemRef: `${item.key}@${item.version}`,
    observedAt: input.observedAt,
  };
  const receipt: StudyAssessmentAttemptReceipt = {
    attemptId,
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidenceKind: 'assessment_item',
    evidenceConceptId: CONCEPT_ID,
    itemConceptId: CONCEPT_ID,
    itemConceptKey: CONCEPT_KEY,
    itemKey: item.key,
    itemVersion: item.version,
    submittedOptionId,
    correct,
    score: correct ? 1 : 0,
    submittedAt: input.observedAt,
    retentionAnchorAt: null,
    delayDays: null,
  };
  attestStudyAssessmentEvidence(row, receipt);
  return row;
}

function projectionTruth(projection: StudyLearnerProjection) {
  const { projectedAt: _projectedAt, ...truth } = projection;
  return truth;
}

const replayAt = '2026-09-02T00:00:00.000Z';

test('H3.1 replay is deterministic for the same admitted ledger and clock', () => {
  const events = [
    evidence({ index: 1, observedAt: '2026-08-31T00:00:00.000Z', itemKey: 'motion-graphs-velocity-slope' }),
    evidence({ index: 2, observedAt: '2026-09-01T00:00:00.000Z', itemKey: 'motion-graphs-acceleration-slope' }),
  ];
  const left = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: events,
    asOf: replayAt,
  });
  const right = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [...events].reverse(),
    asOf: replayAt,
  });

  assert.deepEqual(left, right);
  assert.equal(left.observedThrough, '2026-09-01T00:00:00.000Z');
  assert.deepEqual(left.evidenceKinds, ['assessment_item']);
  assert.equal(left.evidenceCount, 2);
});

test('H3.1 replay changes when admitted learner truth changes', () => {
  const first = evidence({
    index: 1,
    observedAt: '2026-09-01T00:00:00.000Z',
    itemKey: 'motion-graphs-velocity-slope',
  });
  const base = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [first],
    asOf: replayAt,
  });
  const changed = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [
      first,
      evidence({
        index: 2,
        observedAt: '2026-09-01T01:00:00.000Z',
        itemKey: 'motion-graphs-acceleration-slope',
        correct: false,
      }),
    ],
    asOf: replayAt,
  });

  assert.notDeepEqual(projectionTruth(base), projectionTruth(changed));
  assert.notDeepEqual(base.learnerModel, changed.learnerModel);
});

test('H3.1 snapshot write time is not part of learner truth', () => {
  const base = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [evidence({
      index: 1,
      observedAt: '2026-09-01T00:00:00.000Z',
      itemKey: 'motion-graphs-velocity-slope',
    })],
    asOf: replayAt,
  });
  const laterWrite = { ...base, projectedAt: '2026-09-02T01:00:00.000Z' };
  assert.deepEqual(projectionTruth(base), projectionTruth(laterWrite));
});

test('H3.1 replay rejects an invalid clock instead of silently using wall time', () => {
  assert.throws(() => replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [],
    asOf: 'not-a-date',
  }), /study_projection_invalid_as_of/);
});
