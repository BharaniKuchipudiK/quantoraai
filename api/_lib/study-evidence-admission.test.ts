import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admittedStudyMasteryEvidence,
  evaluateStudyEvidenceAdmission,
  studyVerifiedObservationSourceRef,
} from './study-evidence-admission.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const ATTEMPT_ONE = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TWO = '22222222-2222-4222-8222-222222222222';

function event(
  kind: StudyEvidenceKind,
  overrides: Partial<StudyMasteryEvidenceEvent> = {},
): StudyMasteryEvidenceEvent {
  return {
    id: `${kind}-event`,
    conceptId: 'concept-1',
    kind,
    correct: true,
    score: 1,
    difficulty: 0.5,
    hintsUsed: 0,
    independent: true,
    misconceptionSignal: false,
    provenance: 'quantora_authored',
    observedAt: '2026-08-31T00:00:00.000Z',
    ...overrides,
  };
}

function reviewedAssessment(
  overrides: Partial<StudyMasteryEvidenceEvent> = {},
  attemptId = ATTEMPT_ONE,
) {
  return event('assessment_item', {
    id: `study.assessment.${attemptId}`,
    sourceRef: 'quantora:study-assessment-bank',
    assessmentRef: `attempt:${attemptId}`,
    itemRef: 'motion-graphs-velocity-slope@1',
    ...overrides,
  });
}

test('assessment event kind alone cannot enter mastery', () => {
  assert.deepEqual(evaluateStudyEvidenceAdmission(event('assessment_item')), {
    admitted: false,
    reasonCode: 'reviewed_assessment_provenance_required',
  });
});

test('server-issued reviewed assessment evidence is admitted', () => {
  assert.deepEqual(evaluateStudyEvidenceAdmission(reviewedAssessment()), {
    admitted: true,
    reasonCode: 'reviewed_assessment_evidence',
  });
});

test('assessment evidence fails closed on forged provenance, identity, or unknown item versions', () => {
  for (const candidate of [
    reviewedAssessment({ provenance: 'connected_source' }),
    reviewedAssessment({ sourceRef: 'quantora:study-assessment-bank-copy' }),
    reviewedAssessment({ assessmentRef: 'attempt:not-a-uuid' }),
    reviewedAssessment({ itemRef: 'missing-version' }),
    reviewedAssessment({ itemRef: 'unknown-item@1' }),
    reviewedAssessment({ id: 'study.assessment.33333333-3333-4333-8333-333333333333' }),
  ]) {
    assert.equal(evaluateStudyEvidenceAdmission(candidate).admitted, false);
  }
});

test('future verified observation kinds require an explicit governed receipt', () => {
  const plain = event('application');
  assert.deepEqual(evaluateStudyEvidenceAdmission(plain), {
    admitted: false,
    reasonCode: 'verified_observation_receipt_required',
  });

  const sourceRef = studyVerifiedObservationSourceRef('application', 'numeric:sha256:test');
  assert.equal(evaluateStudyEvidenceAdmission(event('application', { sourceRef })).admitted, true);
});

test('self-confidence and non-independent observations never enter mastery', () => {
  assert.equal(evaluateStudyEvidenceAdmission(event('self_confidence', { score: null, correct: null })).admitted, false);
  assert.deepEqual(evaluateStudyEvidenceAdmission(reviewedAssessment({ independent: false })), {
    admitted: false,
    reasonCode: 'independent_evidence_required',
  });
});

test('invalid timestamps and unscored observations fail closed', () => {
  assert.equal(evaluateStudyEvidenceAdmission(reviewedAssessment({ observedAt: 'not-a-date' })).admitted, false);
  assert.equal(evaluateStudyEvidenceAdmission(reviewedAssessment({ score: null, correct: null })).admitted, false);
});

test('mastery and learner state receive one chronological deduplicated evidence set', () => {
  const first = reviewedAssessment({ correct: false, score: 0, observedAt: '2026-08-01T00:00:00.000Z' }, ATTEMPT_ONE);
  const repeated = reviewedAssessment({ correct: true, score: 1, observedAt: '2026-08-02T00:00:00.000Z' }, ATTEMPT_TWO);
  const application = event('application', {
    id: 'application',
    observedAt: '2026-08-03T00:00:00.000Z',
    sourceRef: studyVerifiedObservationSourceRef('application', 'numeric:sha256:application'),
  });

  const admitted = admittedStudyMasteryEvidence([application, repeated, first]);
  assert.deepEqual(admitted.map((row) => row.id), [`study.assessment.${ATTEMPT_ONE}`, 'application']);
  assert.equal(admitted[0].correct, false);
});
