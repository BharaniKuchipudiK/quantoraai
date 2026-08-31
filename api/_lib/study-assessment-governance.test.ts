import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyStudyAssessmentRelease, type StudyAssessmentReleaseCandidate } from './study-assessment-governance.js';

function candidate(overrides: Partial<StudyAssessmentReleaseCandidate> = {}): StudyAssessmentReleaseCandidate {
  return {
    key: 'motion-graphs-velocity-slope',
    version: '1',
    conceptKey: 'physics.kinematics.motion-graphs',
    reviewStatus: 'approved',
    releaseMode: 'reviewed_static',
    ...overrides,
  };
}

test('approved reviewed static item earns an auditable release decision', () => {
  const result = verifyStudyAssessmentRelease(candidate());
  assert.equal(result.canIssueVerifiedAttempt, true);
  assert.equal(result.verification?.decision, 'verified');
  assert.deepEqual(result.evidenceRefs, [
    'quantora:study-assessment-bank:motion-graphs-velocity-slope@1',
  ]);
});

test('draft or rejected static item cannot issue verified evidence', () => {
  for (const reviewStatus of ['draft', 'rejected'] as const) {
    const result = verifyStudyAssessmentRelease(candidate({ reviewStatus }));
    assert.equal(result.canIssueVerifiedAttempt, false);
    assert.ok(result.reasonCodes.includes('assessment_not_approved'));
  }
});

test('parametric family stays blocked until instance verification exists', () => {
  const result = verifyStudyAssessmentRelease(candidate({ releaseMode: 'parametric' }));
  assert.equal(result.canIssueVerifiedAttempt, false);
  assert.deepEqual(result.reasonCodes, ['parametric_instance_verification_required']);
  assert.equal(result.verification, null);
});

test('generated family does not inherit trust from approved review status', () => {
  const result = verifyStudyAssessmentRelease(candidate({ releaseMode: 'generated' }));
  assert.equal(result.canIssueVerifiedAttempt, false);
  assert.deepEqual(result.reasonCodes, ['generated_item_instance_verification_required']);
});

test('invalid assessment identity fails closed before verification', () => {
  const result = verifyStudyAssessmentRelease(candidate({ key: ' ' }));
  assert.equal(result.canIssueVerifiedAttempt, false);
  assert.deepEqual(result.reasonCodes, ['invalid_assessment_release_identity']);
});
