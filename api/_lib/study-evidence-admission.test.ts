import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admittedStudyMasteryEvidence,
  attestStudyAssessmentEvidence,
  evaluateStudyEvidenceAdmission,
  studyAssessmentReceiptForAttestedEvidence,
  type StudyAssessmentAttemptReceipt,
} from './study-evidence-admission.js';
import type { StudyEvidenceKind, StudyMasteryEvidenceEvent } from './study-truth-layer.js';

const ATTEMPT_ONE = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TWO = '22222222-2222-4222-8222-222222222222';
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';

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

function attest(eventRow: StudyMasteryEvidenceEvent, attemptId = ATTEMPT_ONE) {
  const correct = eventRow.correct === true;
  const receipt: StudyAssessmentAttemptReceipt = {
    attemptId,
    conceptId: eventRow.conceptId,
    conceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    submittedOptionId: correct ? 'c' : 'a',
    correct,
    score: typeof eventRow.score === 'number' ? eventRow.score : Number.NaN,
    submittedAt: eventRow.observedAt,
  };
  return attestStudyAssessmentEvidence(eventRow, receipt);
}

test('assessment event shape and provenance strings alone cannot enter mastery', () => {
  assert.deepEqual(evaluateStudyEvidenceAdmission(reviewedAssessment()), {
    admitted: false,
    reasonCode: 'authoritative_assessment_receipt_required',
  });
});

test('authoritatively attested reviewed assessment evidence is admitted with a private receipt', () => {
  const row = reviewedAssessment();
  attest(row);
  assert.deepEqual(evaluateStudyEvidenceAdmission(row), {
    admitted: true,
    reasonCode: 'reviewed_assessment_evidence',
  });
  assert.equal(studyAssessmentReceiptForAttestedEvidence(row)?.submittedOptionId, 'c');
  assert.equal(Object.keys(row).includes('submittedOptionId'), false);
});

test('assessment evidence fails closed on forged provenance, identity, item, score, timestamp, or submitted option', () => {
  const candidates = [
    reviewedAssessment({ provenance: 'connected_source' }),
    reviewedAssessment({ sourceRef: 'quantora:study-assessment-bank-copy' }),
    reviewedAssessment({ assessmentRef: 'attempt:not-a-uuid' }),
    reviewedAssessment({ itemRef: 'unknown-item@1' }),
    reviewedAssessment({ id: 'study.assessment.33333333-3333-4333-8333-333333333333' }),
  ];
  for (const candidate of candidates) {
    attest(candidate);
    assert.equal(evaluateStudyEvidenceAdmission(candidate).admitted, false);
  }

  const wrongScore = reviewedAssessment();
  attestStudyAssessmentEvidence(wrongScore, {
    attemptId: ATTEMPT_ONE,
    conceptId: wrongScore.conceptId,
    conceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    submittedOptionId: 'c',
    correct: true,
    score: 0,
    submittedAt: wrongScore.observedAt,
  });
  assert.equal(evaluateStudyEvidenceAdmission(wrongScore).admitted, false);

  const wrongTime = reviewedAssessment();
  attestStudyAssessmentEvidence(wrongTime, {
    attemptId: ATTEMPT_ONE,
    conceptId: wrongTime.conceptId,
    conceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    submittedOptionId: 'c',
    correct: true,
    score: 1,
    submittedAt: '2026-08-30T00:00:00.000Z',
  });
  assert.equal(evaluateStudyEvidenceAdmission(wrongTime).admitted, false);

  const wrongOption = reviewedAssessment();
  attestStudyAssessmentEvidence(wrongOption, {
    attemptId: ATTEMPT_ONE,
    conceptId: wrongOption.conceptId,
    conceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    submittedOptionId: 'a',
    correct: true,
    score: 1,
    submittedAt: wrongOption.observedAt,
  });
  assert.equal(evaluateStudyEvidenceAdmission(wrongOption).admitted, false);
});

test('non-assessment evidence stays fail-closed even with a verified-looking prefix', () => {
  const prefixed = event('application', {
    sourceRef: 'quantora:study-verified:application:numeric:sha256:test',
  });
  assert.deepEqual(evaluateStudyEvidenceAdmission(prefixed), {
    admitted: false,
    reasonCode: 'verified_observation_receipt_required',
  });
});

test('receipt-backed retrieval and application enter through the same private boundary', () => {
  for (const kind of ['retrieval', 'application'] as const) {
    const row = reviewedAssessment({ kind });
    attestStudyAssessmentEvidence(row, {
      attemptId: ATTEMPT_ONE,
      conceptId: row.conceptId,
      conceptKey: CONCEPT_KEY,
      evidenceKind: kind,
      evidenceConceptId: row.conceptId,
      itemConceptId: row.conceptId,
      itemConceptKey: CONCEPT_KEY,
      itemKey: 'motion-graphs-velocity-slope',
      itemVersion: '1',
      submittedOptionId: 'c',
      correct: true,
      score: 1,
      submittedAt: row.observedAt,
    });
    assert.deepEqual(evaluateStudyEvidenceAdmission(row), {
      admitted: true,
      reasonCode: `reviewed_assessment_backed_${kind}`,
    });
  }
});

test('retention evidence requires a matching delayed server receipt', () => {
  const retained = reviewedAssessment({ kind: 'retention_probe', delayDays: 7 });
  attestStudyAssessmentEvidence(retained, {
    attemptId: ATTEMPT_ONE,
    conceptId: retained.conceptId,
    conceptKey: CONCEPT_KEY,
    evidenceKind: 'retention_probe',
    evidenceConceptId: retained.conceptId,
    itemConceptId: retained.conceptId,
    itemConceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    submittedOptionId: 'c',
    correct: true,
    score: 1,
    submittedAt: retained.observedAt,
    retentionAnchorAt: '2026-08-24T00:00:00.000Z',
    delayDays: 7,
  });
  assert.equal(evaluateStudyEvidenceAdmission(retained).admitted, true);

  const forgedDelay = reviewedAssessment({ kind: 'retention_probe', delayDays: 30 }, ATTEMPT_TWO);
  attestStudyAssessmentEvidence(forgedDelay, {
    attemptId: ATTEMPT_TWO,
    conceptId: forgedDelay.conceptId,
    conceptKey: CONCEPT_KEY,
    evidenceKind: 'retention_probe',
    evidenceConceptId: forgedDelay.conceptId,
    itemConceptId: forgedDelay.conceptId,
    itemConceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    submittedOptionId: 'c',
    correct: true,
    score: 1,
    submittedAt: forgedDelay.observedAt,
    retentionAnchorAt: '2026-08-30T00:00:00.000Z',
    delayDays: 1,
  });
  assert.deepEqual(evaluateStudyEvidenceAdmission(forgedDelay), {
    admitted: false,
    reasonCode: 'verified_observation_receipt_required',
  });
});

test('transfer evidence belongs to the source concept and requires a distinct governed item concept', () => {
  const row = event('transfer', {
    id: `study.assessment.${ATTEMPT_ONE}`,
    conceptId: 'source-concept',
    sourceRef: 'quantora:study-assessment-bank',
    assessmentRef: `attempt:${ATTEMPT_ONE}`,
    itemRef: 'vector-resultant-perpendicular@1',
  });
  attestStudyAssessmentEvidence(row, {
    attemptId: ATTEMPT_ONE,
    conceptId: 'source-concept',
    conceptKey: CONCEPT_KEY,
    evidenceKind: 'transfer',
    evidenceConceptId: 'source-concept',
    itemConceptId: 'target-concept',
    itemConceptKey: 'math.vector.resultant',
    itemKey: 'vector-resultant-perpendicular',
    itemVersion: '1',
    submittedOptionId: 'b',
    correct: true,
    score: 1,
    submittedAt: row.observedAt,
  });
  assert.equal(evaluateStudyEvidenceAdmission(row).admitted, true);
  assert.equal(studyAssessmentReceiptForAttestedEvidence(row)?.evidenceConceptId, 'source-concept');

  const sameConcept = { ...row, id: `study.assessment.${ATTEMPT_TWO}`, assessmentRef: `attempt:${ATTEMPT_TWO}` };
  attestStudyAssessmentEvidence(sameConcept, {
    attemptId: ATTEMPT_TWO,
    conceptId: 'source-concept',
    conceptKey: 'math.vector.resultant',
    evidenceKind: 'transfer',
    evidenceConceptId: 'source-concept',
    itemConceptId: 'source-concept',
    itemConceptKey: 'math.vector.resultant',
    itemKey: 'vector-resultant-perpendicular',
    itemVersion: '1',
    submittedOptionId: 'b',
    correct: true,
    score: 1,
    submittedAt: sameConcept.observedAt,
  });
  assert.equal(evaluateStudyEvidenceAdmission(sameConcept).admitted, false);
});

test('self-confidence and non-independent observations never enter mastery', () => {
  assert.equal(evaluateStudyEvidenceAdmission(event('self_confidence', { score: null, correct: null })).admitted, false);
  const row = reviewedAssessment({ independent: false });
  attest(row);
  assert.deepEqual(evaluateStudyEvidenceAdmission(row), {
    admitted: false,
    reasonCode: 'independent_evidence_required',
  });
});

test('invalid timestamps and unscored observations fail closed', () => {
  const invalidDate = reviewedAssessment({ observedAt: 'not-a-date' });
  attest(invalidDate);
  assert.equal(evaluateStudyEvidenceAdmission(invalidDate).admitted, false);

  const unscored = reviewedAssessment({ score: null, correct: null });
  attest(unscored);
  assert.equal(evaluateStudyEvidenceAdmission(unscored).admitted, false);
});

test('mastery and learner state receive one chronological deduplicated assessment set', () => {
  const first = reviewedAssessment({ correct: false, score: 0, misconceptionSignal: true, observedAt: '2026-08-01T00:00:00.000Z' }, ATTEMPT_ONE);
  attest(first, ATTEMPT_ONE);
  const repeated = reviewedAssessment({ correct: true, score: 1, observedAt: '2026-08-02T00:00:00.000Z' }, ATTEMPT_TWO);
  attest(repeated, ATTEMPT_TWO);

  const admitted = admittedStudyMasteryEvidence([repeated, first]);
  assert.deepEqual(admitted.map((row) => row.id), [`study.assessment.${ATTEMPT_ONE}`]);
  assert.equal(admitted[0].correct, false);
});

test('one reviewed item cannot be relabelled into a second independent evidence kind', () => {
  const assessment = reviewedAssessment({ observedAt: '2026-08-01T00:00:00.000Z' }, ATTEMPT_ONE);
  attest(assessment, ATTEMPT_ONE);
  const retrieval = reviewedAssessment({ kind: 'retrieval', observedAt: '2026-08-02T00:00:00.000Z' }, ATTEMPT_TWO);
  attestStudyAssessmentEvidence(retrieval, {
    attemptId: ATTEMPT_TWO,
    conceptId: retrieval.conceptId,
    conceptKey: CONCEPT_KEY,
    evidenceKind: 'retrieval',
    itemConceptId: retrieval.conceptId,
    itemConceptKey: CONCEPT_KEY,
    itemKey: 'motion-graphs-velocity-slope',
    itemVersion: '1',
    submittedOptionId: 'c',
    correct: true,
    score: 1,
    submittedAt: retrieval.observedAt,
  });
  assert.deepEqual(admittedStudyMasteryEvidence([retrieval, assessment]).map((row) => row.id), [assessment.id]);
});
