import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudyVerificationPlan,
  resolveStudyVerification,
  type StudyVerificationCheck,
} from './study-verification.js';

function verified(verifier: StudyVerificationCheck['verifier'], ref = `trace:${verifier}`): StudyVerificationCheck {
  return { verifier, status: 'verified', evidenceRefs: [ref] };
}

test('numeric claims require numeric verification and may add symbolic evidence', () => {
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-1',
    claimKind: 'numeric',
    mode: 'exam_grounded',
  });

  assert.deepEqual(plan.required, ['numeric']);
  assert.deepEqual(plan.optional, ['symbolic']);
  assert.equal(plan.canAttempt, true);

  const result = resolveStudyVerification(plan, [
    verified('numeric', 'numeric:cos-120=-0.5'),
    verified('symbolic', 'symbolic:cos-identity'),
  ]);
  assert.equal(result.decision, 'verified');
  assert.equal(result.canClaimVerified, true);
  assert.deepEqual(result.evidenceRefs, ['numeric:cos-120=-0.5', 'symbolic:cos-identity']);
});

test('a verifier cannot claim success without auditable evidence', () => {
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-2',
    claimKind: 'symbolic',
    mode: 'exam_grounded',
  });

  const result = resolveStudyVerification(plan, [
    { verifier: 'symbolic', status: 'verified', evidenceRefs: [] },
  ]);
  assert.equal(result.decision, 'insufficient');
  assert.equal(result.canClaimVerified, false);
  assert.ok(result.reasonCodes.includes('symbolic_missing_evidence'));
});

test('a required rejection wins even when optional checks pass', () => {
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-3',
    claimKind: 'symbolic',
    mode: 'explore',
  });

  const result = resolveStudyVerification(plan, [
    { verifier: 'symbolic', status: 'rejected', evidenceRefs: ['symbolic:counterexample'], reasonCode: 'expressions_not_equivalent' },
    verified('numeric', 'numeric:sample-check'),
  ]);
  assert.equal(result.decision, 'rejected');
  assert.equal(result.canClaimVerified, false);
  assert.ok(result.reasonCodes.includes('expressions_not_equivalent'));
});

test('formal proof claims are blocked until the claim is formalizable', () => {
  const blocked = buildStudyVerificationPlan({
    claimId: 'claim-4',
    claimKind: 'formal_proof',
    mode: 'exam_grounded',
    formalizable: false,
  });
  assert.equal(blocked.canAttempt, false);
  assert.ok(blocked.blockers.includes('formalization_required'));

  const routable = buildStudyVerificationPlan({
    claimId: 'claim-4b',
    claimKind: 'formal_proof',
    mode: 'exam_grounded',
    formalizable: true,
  });
  assert.deepEqual(routable.required, ['formal']);
  assert.equal(routable.canAttempt, true);
});

test('exam-grounded curriculum facts require a canonical source class', () => {
  const webOnly = buildStudyVerificationPlan({
    claimId: 'claim-5',
    claimKind: 'curriculum_fact',
    mode: 'exam_grounded',
    groundingSources: [{ ref: 'https://example.com/post', kind: 'web' }],
  });
  assert.equal(webOnly.canAttempt, false);
  assert.ok(webOnly.blockers.includes('canonical_source_required'));

  const official = buildStudyVerificationPlan({
    claimId: 'claim-5b',
    claimKind: 'curriculum_fact',
    mode: 'exam_grounded',
    groundingSources: [{ ref: 'ncert:physics:class-11:chapter-5', kind: 'official' }],
  });
  assert.equal(official.canAttempt, true);
  assert.deepEqual(official.required, ['grounded_source']);
});

test('explore mode may verify a factual claim against a cited web source', () => {
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-6',
    claimKind: 'curriculum_fact',
    mode: 'explore',
    groundingSources: [{ ref: 'web:https://example.com/reference', kind: 'web' }],
  });
  assert.equal(plan.canAttempt, true);

  const result = resolveStudyVerification(plan, [
    verified('grounded_source', 'web:https://example.com/reference#support'),
  ]);
  assert.equal(result.decision, 'verified');
});

test('unreviewed assessment keys can never become verified learner evidence', () => {
  const draft = buildStudyVerificationPlan({
    claimId: 'claim-7',
    claimKind: 'assessment_key',
    mode: 'exam_grounded',
    assessmentReviewStatus: 'draft',
  });
  assert.equal(draft.canAttempt, false);
  assert.ok(draft.blockers.includes('assessment_not_approved'));
  assert.equal(resolveStudyVerification(draft, [verified('reviewed_assessment')]).decision, 'insufficient');

  const approved = buildStudyVerificationPlan({
    claimId: 'claim-7b',
    claimKind: 'assessment_key',
    mode: 'exam_grounded',
    assessmentReviewStatus: 'approved',
  });
  const result = resolveStudyVerification(approved, [
    verified('reviewed_assessment', 'assessment:item-42:v3:review-approved'),
  ]);
  assert.equal(result.decision, 'verified');
  assert.equal(result.canClaimVerified, true);
});

test('missing required checks remain insufficient rather than guessing', () => {
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-8',
    claimKind: 'numeric',
    mode: 'exam_grounded',
  });
  const result = resolveStudyVerification(plan, []);
  assert.equal(result.decision, 'insufficient');
  assert.equal(result.canClaimVerified, false);
  assert.ok(result.reasonCodes.includes('missing_numeric'));
});
