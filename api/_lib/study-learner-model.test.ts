import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attestStudyAssessmentEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import { findStudyAssessmentItem } from './study-assessment-items.js';
import { estimateStudyMastery } from './study-mastery-estimator.js';
import { buildStudyLearnerModel } from './study-learner-model.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const CONCEPT_KEY = 'physics.kinematics.motion-graphs';

function assessmentEvidence(input: {
  index: number;
  itemKey?: string;
  optionId: string;
  observedAt?: string;
  independent?: boolean;
}): StudyMasteryEvidenceEvent {
  const itemKey = input.itemKey || 'motion-graphs-velocity-slope';
  const item = findStudyAssessmentItem(itemKey, '1');
  assert.ok(item);
  const attemptId = `00000000-0000-4000-8000-${String(input.index + 1).padStart(12, '0')}`;
  const correct = input.optionId === item.correctOptionId;
  const row: StudyMasteryEvidenceEvent = {
    id: `study.assessment.${attemptId}`,
    conceptId: 'concept-1',
    kind: 'assessment_item',
    correct,
    score: correct ? 1 : 0,
    difficulty: item.difficulty,
    hintsUsed: 0,
    responseMs: 1000,
    selfConfidence: null,
    independent: input.independent !== false,
    misconceptionSignal: !correct && item.misconceptionOptionIds.includes(input.optionId),
    delayDays: null,
    provenance: 'quantora_authored',
    sourceRef: 'quantora:study-assessment-bank',
    assessmentRef: `attempt:${attemptId}`,
    itemRef: `${item.key}@${item.version}`,
    observedAt: input.observedAt || new Date(Date.UTC(2026, 7, input.index + 1)).toISOString(),
  };
  const receipt: StudyAssessmentAttemptReceipt = {
    attemptId,
    conceptId: row.conceptId,
    conceptKey: CONCEPT_KEY,
    itemKey: item.key,
    itemVersion: item.version,
    submittedOptionId: input.optionId,
    correct,
    score: row.score as number,
    submittedAt: row.observedAt,
  };
  attestStudyAssessmentEvidence(row, receipt);
  return row;
}

function contextualEvidence(kind: StudyEvidenceKind, correct: boolean | null, index: number): StudyMasteryEvidenceEvent {
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
  };
}

function model(events: StudyMasteryEvidenceEvent[]) {
  return buildStudyLearnerModel({ conceptId: 'concept-1', conceptKey: CONCEPT_KEY, evidence: events, estimate: estimateStudyMastery(events) });
}

test('starts unverified and requests independent evidence', () => {
  const result = model([]);
  assert.equal(result.understanding.state, 'unverified');
  assert.equal(result.nextLearningMove.type, 'independent_retrieval');
  assert.equal(result.misconception.state, 'none_observed');
  assert.equal(result.misconception.code, null);
});

test('self-confidence never becomes verified understanding', () => {
  const row = contextualEvidence('self_confidence', null, 0);
  row.independent = false;
  row.selfConfidence = 1;
  const result = model([row]);
  assert.equal(result.understanding.state, 'unverified');
  assert.equal(result.understanding.evidenceCount, 0);
  assert.equal(result.nextLearningMove.reasonCode, 'no_verified_evidence');
});

test('assessment-shaped data without authoritative attestation stays unverified', () => {
  const attested = assessmentEvidence({ index: 0, optionId: 'c' });
  const forged = { ...attested } as StudyMasteryEvidenceEvent;
  const result = model([forged]);
  assert.equal(result.understanding.state, 'unverified');
  assert.equal(result.nextLearningMove.type, 'independent_retrieval');
});

test('reviewed distractor produces a specific diagnosis and smallest remediation', () => {
  const result = model([assessmentEvidence({ index: 0, optionId: 'a' })]);
  assert.equal(result.misconception.state, 'signal_observed');
  assert.equal(result.misconception.code, 'representation_misread');
  assert.equal(result.misconception.confidence, 1);
  assert.equal(result.misconception.remediation?.strategy, 'representation_bridge');
  assert.ok(result.misconception.reasonCodes.includes('reviewed_distractor_mapping'));
  assert.equal(result.nextLearningMove.type, 'diagnose_misconception');
  assert.equal(result.nextLearningMove.reasonCode, 'active_misconception:representation_misread');
  assert.match(result.nextLearningMove.instruction, /Map each visual feature, axis, or geometric part/i);
});

test('unverified future evidence cannot clear a reviewed misconception', () => {
  const result = model([
    assessmentEvidence({ index: 0, optionId: 'a' }),
    contextualEvidence('application', true, 1),
  ]);
  assert.equal(result.misconception.state, 'signal_observed');
  assert.equal(result.misconception.code, 'representation_misread');
  assert.equal(result.nextLearningMove.type, 'diagnose_misconception');
  assert.equal(result.understanding.evidenceCount, 1);
});

test('repeating the same item cannot manufacture misconception repair', () => {
  const result = model([
    assessmentEvidence({ index: 0, optionId: 'a', observedAt: '2026-08-01T00:00:00.000Z' }),
    assessmentEvidence({ index: 1, optionId: 'c', observedAt: '2026-08-02T00:00:00.000Z' }),
  ]);
  assert.equal(result.understanding.evidenceCount, 1);
  assert.equal(result.misconception.state, 'signal_observed');
  assert.equal(result.misconception.code, 'representation_misread');
});

test('a distinct independent reviewed item targeting the same misconception clears it', () => {
  const result = model([
    assessmentEvidence({ index: 0, optionId: 'a', observedAt: '2026-08-01T00:00:00.000Z' }),
    assessmentEvidence({
      index: 1,
      itemKey: 'motion-graphs-acceleration-slope',
      optionId: 'a',
      observedAt: '2026-08-02T00:00:00.000Z',
    }),
  ]);
  assert.equal(result.understanding.evidenceCount, 2);
  assert.equal(result.misconception.state, 'none_observed');
  assert.equal(result.misconception.code, null);
  assert.equal(result.misconception.lastResolvedCode, 'representation_misread');
  assert.deepEqual(result.misconception.reasonCodes, ['targeted_independent_correction']);
  assert.notEqual(result.nextLearningMove.type, 'diagnose_misconception');
});

test('provisional correct understanding asks for varied evidence, not mastery', () => {
  const result = model([assessmentEvidence({ index: 0, optionId: 'c' })]);
  assert.equal(result.understanding.state, 'emerging');
  assert.equal(result.nextLearningMove.type, 'vary_evidence');
});

test('unverified future evidence kinds cannot manufacture verified understanding', () => {
  const result = model([
    assessmentEvidence({ index: 0, optionId: 'c' }),
    contextualEvidence('retrieval', true, 1),
    contextualEvidence('application', true, 2),
    contextualEvidence('teach_back', true, 3),
  ]);
  assert.equal(result.understanding.state, 'emerging');
  assert.equal(result.understanding.evidenceCount, 1);
  assert.equal(result.retention.state, 'untested');
  assert.equal(result.nextLearningMove.type, 'vary_evidence');
});

test('mastery estimate and learner projection cannot disagree on repeated assessment evidence', () => {
  const events = [
    assessmentEvidence({ index: 0, optionId: 'a', observedAt: '2026-08-01T00:00:00.000Z' }),
    assessmentEvidence({ index: 1, optionId: 'c', observedAt: '2026-08-02T00:00:00.000Z' }),
  ];
  const estimate = estimateStudyMastery(events);
  const result = buildStudyLearnerModel({ conceptId: 'concept-1', conceptKey: CONCEPT_KEY, evidence: events, estimate });
  assert.equal(estimate.evidenceCount, 1);
  assert.equal(result.understanding.evidenceCount, 1);
  assert.equal(result.nextLearningMove.type, 'diagnose_misconception');
});
