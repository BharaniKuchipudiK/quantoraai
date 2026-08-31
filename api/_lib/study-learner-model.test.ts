import assert from 'node:assert/strict';
import test from 'node:test';
import { studyVerifiedObservationSourceRef } from './study-evidence-admission.js';
import { estimateStudyMastery } from './study-mastery-estimator.js';
import { buildStudyLearnerModel } from './study-learner-model.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

function evidence(kind: StudyEvidenceKind, correct: boolean | null, index: number, overrides: Partial<StudyMasteryEvidenceEvent> = {}): StudyMasteryEvidenceEvent {
  const attemptId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  const governedSource = kind === 'assessment_item'
    ? {
        id: `study.assessment.${attemptId}`,
        sourceRef: 'quantora:study-assessment-bank',
        assessmentRef: `attempt:${attemptId}`,
        itemRef: 'motion-graphs-velocity-slope@1',
      }
    : kind === 'self_confidence'
      ? {}
      : { sourceRef: studyVerifiedObservationSourceRef(kind, `test:${index}`) };
  return {
    id: `event-${index}`,
    conceptId: 'concept-1',
    kind,
    correct,
    score: correct == null ? null : correct ? 1 : 0,
    difficulty: 0.5,
    hintsUsed: 0,
    responseMs: 1000,
    selfConfidence: null,
    independent: true,
    misconceptionSignal: false,
    delayDays: null,
    provenance: 'quantora_authored',
    observedAt: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
    ...governedSource,
    ...overrides,
  };
}

function model(events: StudyMasteryEvidenceEvent[]) {
  return buildStudyLearnerModel({ conceptId: 'concept-1', conceptKey: 'physics.motion', evidence: events, estimate: estimateStudyMastery(events) });
}

test('starts unverified and requests independent evidence', () => {
  const result = model([]);
  assert.equal(result.understanding.state, 'unverified');
  assert.equal(result.nextLearningMove.type, 'independent_retrieval');
  assert.equal(result.misconception.state, 'none_observed');
});

test('self-confidence never becomes verified understanding', () => {
  const events = [evidence('self_confidence', null, 0, { independent: false, selfConfidence: 1 })];
  const result = model(events);
  assert.equal(result.understanding.state, 'unverified');
  assert.equal(result.understanding.evidenceCount, 0);
  assert.equal(result.nextLearningMove.reasonCode, 'no_verified_evidence');
});

test('assessment-shaped data without a reviewed receipt stays unverified', () => {
  const events = [evidence('assessment_item', true, 0, { sourceRef: null, assessmentRef: null, itemRef: null })];
  const result = model(events);
  assert.equal(result.understanding.state, 'unverified');
  assert.equal(result.nextLearningMove.type, 'independent_retrieval');
});

test('an active misconception signal selects targeted diagnosis', () => {
  const events = [evidence('misconception_probe', false, 0, { misconceptionSignal: true })];
  const result = model(events);
  assert.equal(result.misconception.state, 'signal_observed');
  assert.equal(result.understanding.state, 'emerging');
  assert.equal(result.nextLearningMove.type, 'diagnose_misconception');
});

test('a later independent success downgrades the signal to confirmation needed', () => {
  const events = [
    evidence('misconception_probe', false, 0, { misconceptionSignal: true }),
    evidence('application', true, 1),
  ];
  const result = model(events);
  assert.equal(result.misconception.state, 'needs_confirmation');
  assert.equal(result.nextLearningMove.type, 'confirm_misconception');
});

test('a later successful misconception probe resolves the active signal', () => {
  const events = [
    evidence('misconception_probe', false, 0, { misconceptionSignal: true }),
    evidence('misconception_probe', true, 1),
  ];
  const result = model(events);
  assert.equal(result.misconception.state, 'none_observed');
  assert.notEqual(result.nextLearningMove.type, 'confirm_misconception');
});

test('provisional understanding asks for varied evidence, not mastery', () => {
  const events = [evidence('assessment_item', true, 0)];
  const result = model(events);
  assert.equal(result.understanding.state, 'emerging');
  assert.equal(result.nextLearningMove.type, 'vary_evidence');
});

test('established understanding without retention selects a retention probe', () => {
  const events = [
    evidence('assessment_item', true, 0),
    evidence('retrieval', true, 1),
    evidence('application', true, 2),
    evidence('teach_back', true, 3),
  ];
  const result = model(events);
  assert.equal(result.understanding.state, 'verified');
  assert.equal(result.retention.state, 'untested');
  assert.equal(result.nextLearningMove.type, 'retention_probe');
});

test('supported retention advances to a transfer task', () => {
  const events = [
    evidence('assessment_item', true, 0),
    evidence('retrieval', true, 1),
    evidence('application', true, 2),
    evidence('teach_back', true, 3),
    evidence('retention_probe', true, 4, { delayDays: 14 }),
  ];
  const result = model(events);
  assert.equal(result.understanding.state, 'verified');
  assert.equal(result.retention.state, 'supported');
  assert.equal(result.nextLearningMove.type, 'transfer_task');
});

test('mastery estimate and learner projection cannot disagree on repeated assessment evidence', () => {
  const events = [
    evidence('assessment_item', false, 0, { observedAt: '2026-08-01T00:00:00.000Z' }),
    evidence('assessment_item', true, 1, { observedAt: '2026-08-02T00:00:00.000Z' }),
  ];
  const estimate = estimateStudyMastery(events);
  const result = buildStudyLearnerModel({ conceptId: 'concept-1', conceptKey: 'physics.motion', evidence: events, estimate });
  assert.equal(estimate.evidenceCount, 1);
  assert.equal(result.understanding.evidenceCount, 1);
  assert.equal(result.nextLearningMove.type, 'guided_repair');
});
