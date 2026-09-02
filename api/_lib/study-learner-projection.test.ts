import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import { replayStudyLearnerProjection } from './study-learner-projection.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const CONCEPT_ID = 'concept-projection';
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';
const ITEM_KEY = 'motion-graphs-velocity-slope';

function evidence(index: number, observedAt: string): StudyMasteryEvidenceEvent {
  const item = findStudyAssessmentItem(ITEM_KEY, '1');
  assert.ok(item);
  const attemptId = `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const row: StudyMasteryEvidenceEvent = {
    id: `study.assessment.${attemptId}`,
    conceptId: CONCEPT_ID,
    kind: 'assessment_item',
    correct: true,
    score: 1,
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
    observedAt,
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
    submittedOptionId: item.correctOptionId,
    correct: true,
    score: 1,
    submittedAt: observedAt,
    retentionAnchorAt: null,
    delayDays: null,
  };
  attestStudyAssessmentEvidence(row, receipt);
  return row;
}

const replayAt = '2026-09-02T00:00:00.000Z';

test('H3.1 replay is deterministic for the same admitted ledger and clock', () => {
  const events = [
    evidence(1, '2026-08-31T00:00:00.000Z'),
    evidence(2, '2026-09-01T00:00:00.000Z'),
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
  assert.equal(left.observedThrough, '2026-08-31T00:00:00.000Z');
  assert.deepEqual(left.evidenceKinds, ['assessment_item']);
  assert.equal(left.evidenceCount, 1, 'same governed item/version remains one independent mastery contribution');
});

test('H3.1 replay changes when admitted learner truth changes', () => {
  const empty = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [],
    asOf: replayAt,
  });
  const withEvidence = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [evidence(1, '2026-09-01T00:00:00.000Z')],
    asOf: replayAt,
  });

  assert.notDeepEqual(empty, withEvidence);
  assert.equal(empty.evidenceCount, 0);
  assert.equal(withEvidence.evidenceCount, 1);
  assert.notDeepEqual(empty.learnerModel, withEvidence.learnerModel);
});

test('H3.1 snapshot write time is not part of learner truth', () => {
  const base = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [evidence(1, '2026-09-01T00:00:00.000Z')],
    asOf: replayAt,
  });
  const later = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [evidence(1, '2026-09-01T00:00:00.000Z')],
    asOf: '2026-09-02T01:00:00.000Z',
  });
  assert.deepEqual(
    { ...base, projectedAt: '' },
    { ...later, projectedAt: '' },
  );
});

test('H3.1 replay rejects an invalid clock instead of silently using wall time', () => {
  assert.throws(() => replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [],
    asOf: 'not-a-date',
  }), /study_projection_invalid_as_of/);
});
