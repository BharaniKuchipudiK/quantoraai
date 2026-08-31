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

test('exam-grounded curriculum facts derive canonical authority instead of trusting source labels', () => {
  const webOnly = buildStudyVerificationPlan({
    claimId: 'claim-5',
    claimKind: 'curriculum_fact',
    mode: 'exam_grounded',
    groundingSources: [{ ref: 'https://example.com/post', kind: 'official' }],
  });
  assert.equal(webOnly.canAttempt, false);
  assert.ok(webOnly.blockers.includes('canonical_source_required'));
  assert.equal(webOnly.groundingSources[0]?.kind, 'web');

  const official = buildStudyVerificationPlan({
    claimId: 'claim-5b',
    claimKind: 'curriculum_fact',
    mode: 'exam_grounded',
    groundingSources: [{ ref: 'https://ncert.nic.in/textbook.php?gesc1=1-10', kind: 'web' }],
  });
  assert.equal(official.canAttempt, true);
  assert.deepEqual(official.required, ['grounded_source']);
  assert.equal(official.groundingSources[0]?.kind, 'official');
  assert.equal(official.groundingSources[0]?.authorityId, 'ncert');
});

test('curriculum facts cannot be routed without a citable source in either mode', () => {
  for (const mode of ['exam_grounded', 'explore'] as const) {
    const plan = buildStudyVerificationPlan({
      claimId: `claim-source-${mode}`,
      claimKind: 'curriculum_fact',
      mode,
      groundingSources: [],
    });
    assert.equal(plan.canAttempt, false);
    assert.ok(plan.blockers.includes('grounding_source_required'));
  }
});

test('explore mode may verify a factual claim against a cited web source', () => {
  const source = 'https://example.com/reference';
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-6',
    claimKind: 'curriculum_fact',
    mode: 'explore',
    groundingSources: [{ ref: `web:${source}`, kind: 'official' }],
  });
  assert.equal(plan.canAttempt, true);
  assert.equal(plan.groundingSources[0]?.kind, 'web');

  const result = resolveStudyVerification(plan, [
    verified('grounded_source', `${source}#support`),
  ]);
  assert.equal(result.decision, 'verified');
  assert.equal(result.canClaimVerified, true);
});

test('grounded-source success is insufficient when evidence is not bound to an admitted source', () => {
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-6b',
    claimKind: 'curriculum_fact',
    mode: 'exam_grounded',
    groundingSources: [{ ref: 'https://ncert.nic.in/textbook.php?gesc1=1-10' }],
  });
  const result = resolveStudyVerification(plan, [
    verified('grounded_source', 'https://example.com/article#support'),
  ]);
  assert.equal(result.decision, 'insufficient');
  assert.equal(result.canClaimVerified, false);
  assert.ok(result.reasonCodes.includes('grounded_source_unbound_evidence'));
  assert.deepEqual(result.evidenceRefs, []);
});

test('Exam Grounded evidence must bind to the canonical source admitted by the plan', () => {
  const source = 'https://ncert.nic.in/textbook.php?gesc1=1-10';
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-6c',
    claimKind: 'curriculum_fact',
    mode: 'exam_grounded',
    groundingSources: [
      { ref: source },
      { ref: 'https://example.com/secondary-reference' },
    ],
  });
  const result = resolveStudyVerification(plan, [
    verified('grounded_source', `${source}#chapter-10`),
  ]);
  assert.equal(result.decision, 'verified');
  assert.equal(result.canClaimVerified, true);
  assert.deepEqual(result.evidenceRefs, [`${source}#chapter-10`]);
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

test('invalid verification modes are blockers rather than falling back to Explore', () => {
  const plan = buildStudyVerificationPlan({
    claimId: 'claim-invalid-mode',
    claimKind: 'curriculum_fact',
    mode: 'anything' as never,
    groundingSources: [{ ref: 'https://example.com/reference' }],
  });
  assert.equal(plan.canAttempt, false);
  assert.ok(plan.blockers.includes('invalid_verification_mode'));
  assert.equal(resolveStudyVerification(plan, [
    verified('grounded_source', 'https://example.com/reference'),
  ]).decision, 'insufficient');
});
