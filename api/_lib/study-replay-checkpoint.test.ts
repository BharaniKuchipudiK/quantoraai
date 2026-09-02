import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import { replayStudyLearnerProjection } from './study-learner-projection.js';
import {
  buildStudyReplayCheckpoint,
  replayStudyLearnerProjectionFromCheckpoint,
  studyLearnerProjectionSemanticallyEqual,
} from './study-replay-checkpoint.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const CONCEPT_ID = '11111111-1111-4111-8111-111111111111';
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';
const TARGET_CONCEPT_ID = '22222222-2222-4222-8222-222222222222';

function assessment(input: {
  index: number;
  itemKey: string;
  observedAt: string;
  kind?: Extract<StudyEvidenceKind, 'assessment_item' | 'retrieval' | 'application' | 'retention_probe' | 'transfer'>;
  correct?: boolean;
  delayDays?: number | null;
  retentionAnchorAt?: string | null;
}): StudyMasteryEvidenceEvent {
  const item = findStudyAssessmentItem(input.itemKey, '1');
  assert.ok(item);
  const kind = input.kind || 'assessment_item';
  const attemptId = `70000000-0000-4000-8000-${String(input.index).padStart(12, '0')}`;
  const correct = input.correct !== false;
  const optionId = correct ? item.correctOptionId : item.misconceptionOptionIds[0];
  assert.ok(optionId);
  const itemConceptKey = kind === 'transfer' ? item.conceptKey : CONCEPT_KEY;
  const row: StudyMasteryEvidenceEvent = {
    id: `study.assessment.${attemptId}`,
    conceptId: CONCEPT_ID,
    kind,
    correct,
    score: correct ? 1 : 0,
    difficulty: item.difficulty,
    hintsUsed: 0,
    responseMs: 900,
    selfConfidence: null,
    independent: true,
    misconceptionSignal: kind === 'retention_probe' || kind === 'transfer'
      ? false
      : !correct && item.misconceptionOptionIds.includes(optionId),
    delayDays: input.delayDays ?? null,
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
    evidenceKind: kind,
    evidenceConceptId: CONCEPT_ID,
    itemConceptId: kind === 'transfer' ? TARGET_CONCEPT_ID : CONCEPT_ID,
    itemConceptKey,
    itemKey: item.key,
    itemVersion: item.version,
    submittedOptionId: optionId,
    correct,
    score: correct ? 1 : 0,
    submittedAt: input.observedAt,
    retentionAnchorAt: input.retentionAnchorAt || null,
    delayDays: input.delayDays ?? null,
  };
  attestStudyAssessmentEvidence(row, receipt);
  return row;
}

function checkpoint(events: StudyMasteryEvidenceEvent[]) {
  return buildStudyReplayCheckpoint({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: events,
    cursor: { createdAt: '2026-09-01T00:00:00.000Z', id: 'cursor-1' },
  });
}

function assertParity(base: StudyMasteryEvidenceEvent[], delta: StudyMasteryEvidenceEvent[], asOf: string) {
  const full = replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [...base, ...delta],
    asOf,
  });
  const replayed = replayStudyLearnerProjectionFromCheckpoint({
    checkpoint: checkpoint(base),
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    deltaEvidence: delta,
    asOf,
    cursor: { createdAt: '2026-09-02T00:00:00.000Z', id: 'cursor-2' },
  });
  assert.equal(replayed.status, 'replayed');
  if (replayed.status !== 'replayed') return;
  assert.deepEqual(replayed.projection, full);
  assert.equal(studyLearnerProjectionSemanticallyEqual(replayed.projection, full), true);
}

test('H3.3 checkpoint + delta matches full replay for misconception repair', () => {
  const signal = assessment({ index: 1, itemKey: 'motion-graphs-velocity-slope', observedAt: '2026-08-01T00:00:00.000Z', correct: false });
  const repair = assessment({ index: 2, itemKey: 'motion-graphs-acceleration-slope', observedAt: '2026-08-02T00:00:00.000Z' });
  assertParity([signal], [repair], '2026-08-03T00:00:00.000Z');
});

test('H3.3 checkpoint + delta matches full replay for delayed retention', () => {
  const learned = assessment({ index: 3, itemKey: 'motion-graphs-velocity-slope', observedAt: '2026-08-01T00:00:00.000Z' });
  const retained = assessment({
    index: 4,
    itemKey: 'motion-graphs-acceleration-slope',
    kind: 'retention_probe',
    observedAt: '2026-08-08T00:00:00.000Z',
    retentionAnchorAt: '2026-08-01T00:00:00.000Z',
    delayDays: 7,
  });
  assertParity([learned], [retained], '2026-08-20T00:00:00.000Z');
});

test('H3.3 checkpoint + delta matches full replay for governed transfer', () => {
  const learned = assessment({ index: 5, itemKey: 'motion-graphs-velocity-slope', observedAt: '2026-08-01T00:00:00.000Z' });
  const transfer = assessment({ index: 6, itemKey: 'vector-resultant-perpendicular', kind: 'transfer', observedAt: '2026-08-10T00:00:00.000Z' });
  assertParity([learned], [transfer], '2026-08-11T00:00:00.000Z');
});

test('H3.3 checkpoint preserves item/version dedupe across the cursor boundary', () => {
  const first = assessment({ index: 7, itemKey: 'motion-graphs-velocity-slope', observedAt: '2026-08-01T00:00:00.000Z' });
  const repeated = assessment({ index: 8, itemKey: 'motion-graphs-velocity-slope', kind: 'retrieval', observedAt: '2026-08-02T00:00:00.000Z' });
  assertParity([first], [repeated], '2026-08-03T00:00:00.000Z');
});

test('H3.3 checkpoint replay recomputes time-sensitive retention from injected asOf', () => {
  const learned = assessment({ index: 9, itemKey: 'motion-graphs-velocity-slope', observedAt: '2026-08-01T00:00:00.000Z' });
  assertParity([learned], [], '2026-08-03T00:00:00.000Z');
  assertParity([learned], [], '2026-08-20T00:00:00.000Z');
});

test('H3.3 late-appended backdated evidence requires authoritative full replay', () => {
  const newer = assessment({ index: 11, itemKey: 'motion-graphs-velocity-slope', observedAt: '2026-08-10T00:00:00.000Z' });
  const backdated = assessment({ index: 12, itemKey: 'motion-graphs-acceleration-slope', observedAt: '2026-08-05T00:00:00.000Z' });
  const result = replayStudyLearnerProjectionFromCheckpoint({
    checkpoint: checkpoint([newer]),
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    deltaEvidence: [backdated],
    asOf: '2026-08-11T00:00:00.000Z',
  });
  assert.deepEqual(result, { status: 'incompatible', reasonCode: 'backdated_delta_requires_full_replay' });
});

test('H3.3 checkpoint refuses incompatible versions instead of guessing', () => {
  const base = checkpoint([]);
  const result = replayStudyLearnerProjectionFromCheckpoint({
    checkpoint: { ...base, estimatorVersion: 'future-estimator' },
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    deltaEvidence: [],
    asOf: '2026-09-02T00:00:00.000Z',
  });
  assert.deepEqual(result, { status: 'incompatible', reasonCode: 'estimator_version_mismatch' });
});

test('H3.3 checkpoint carries derived replay state, not raw evidence rows', () => {
  const base = assessment({ index: 10, itemKey: 'motion-graphs-velocity-slope', observedAt: '2026-08-01T00:00:00.000Z' });
  const serialized = JSON.stringify(checkpoint([base]));
  assert.doesNotMatch(serialized, /assessmentRef|sourceRef|responseMs|selfConfidence/);
  assert.match(serialized, /seenAssessmentItemRefs/);
  assert.match(serialized, /masteryState/);
  assert.match(serialized, /learnerState/);
});
