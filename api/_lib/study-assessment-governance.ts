import { buildStudyVerificationPlan, type StudyAssessmentReviewStatus, type StudyVerificationOutcome } from './study-verification.js';
import { executeStudyVerificationPlan } from './study-verification-runtime.js';

export const STUDY_ASSESSMENT_GOVERNANCE_VERSION = 'study-assessment-governance-2026-08-31.1';

export type StudyAssessmentReleaseMode = 'reviewed_static' | 'parametric' | 'generated';

export type StudyAssessmentReleaseCandidate = {
  key: string;
  version: string;
  conceptKey: string;
  reviewStatus: StudyAssessmentReviewStatus;
  releaseMode: StudyAssessmentReleaseMode;
};

export type StudyAssessmentReleaseDecision = {
  version: string;
  itemRef: string;
  releaseMode: StudyAssessmentReleaseMode;
  canIssueVerifiedAttempt: boolean;
  reasonCodes: string[];
  evidenceRefs: string[];
  verification: StudyVerificationOutcome | null;
};

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/**
 * One release gate for every assessment family.
 *
 * V4 supports the existing reviewed static bank. Parametric/generated families
 * are named here now so they cannot accidentally inherit static-item trust;
 * they remain blocked until an instance-level verifier is wired for them.
 */
export function verifyStudyAssessmentRelease(
  item: StudyAssessmentReleaseCandidate,
): StudyAssessmentReleaseDecision {
  const key = clean(item?.key, 200);
  const version = clean(item?.version, 80);
  const conceptKey = clean(item?.conceptKey, 200).toLowerCase();
  const itemRef = key && version ? `${key}@${version}` : '';

  if (!itemRef || !conceptKey) {
    return {
      version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
      itemRef,
      releaseMode: item?.releaseMode,
      canIssueVerifiedAttempt: false,
      reasonCodes: ['invalid_assessment_release_identity'],
      evidenceRefs: [],
      verification: null,
    };
  }

  if (item.releaseMode !== 'reviewed_static') {
    return {
      version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
      itemRef,
      releaseMode: item.releaseMode,
      canIssueVerifiedAttempt: false,
      reasonCodes: [item.releaseMode === 'parametric'
        ? 'parametric_instance_verification_required'
        : 'generated_item_instance_verification_required'],
      evidenceRefs: [],
      verification: null,
    };
  }

  const plan = buildStudyVerificationPlan({
    claimId: `assessment-key:${itemRef}`,
    claimKind: 'assessment_key',
    mode: 'exam_grounded',
    subject: conceptKey.split('.')[0] || null,
    assessmentReviewStatus: item.reviewStatus,
  });
  const verification = executeStudyVerificationPlan({
    plan,
    reviewedAssessment: {
      reviewStatus: item.reviewStatus,
      evidenceRef: `quantora:study-assessment-bank:${itemRef}`,
    },
  }).outcome;

  return {
    version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
    itemRef,
    releaseMode: item.releaseMode,
    canIssueVerifiedAttempt: verification.canClaimVerified,
    reasonCodes: verification.reasonCodes,
    evidenceRefs: verification.evidenceRefs,
    verification,
  };
}
