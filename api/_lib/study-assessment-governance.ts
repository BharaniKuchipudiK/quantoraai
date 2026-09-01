import { buildStudyVerificationPlan, type StudyAssessmentReviewStatus, type StudyVerificationOutcome } from './study-verification.js';
import { executeStudyVerificationPlan } from './study-verification-runtime.js';
import {
  validateStudyAssessmentCorpusRecord,
  type StudyAssessmentCorpusMetadata,
} from './study-assessment-corpus.js';
import { validateStudyAssessmentItemQuality } from './study-assessment-quality.js';
import { studyAssessmentCorpusReadiness } from './study-assessment-corpus-readiness.js';

export const STUDY_ASSESSMENT_GOVERNANCE_VERSION = 'study-assessment-governance-2026-09-02.2';

export type StudyAssessmentReleaseMode = 'reviewed_static' | 'parametric' | 'generated';

export type StudyAssessmentReleaseCandidate = {
  key: string;
  version: string;
  conceptKey: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  reviewStatus: StudyAssessmentReviewStatus;
  releaseMode: StudyAssessmentReleaseMode;
  objectiveCode: string;
  difficulty: number;
  corpus: StudyAssessmentCorpusMetadata;
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
 * Reviewed-static items must satisfy verification, H2 corpus structure, H2.2
 * item quality, and the explicit corpus-wide pilot readiness floor. Parametric
 * and generated families remain blocked until an instance-level verifier is
 * wired for them.
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

  if (item.corpus?.lifecycle?.state !== 'released') {
    return {
      version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
      itemRef,
      releaseMode: item.releaseMode,
      canIssueVerifiedAttempt: false,
      reasonCodes: ['assessment_corpus_item_not_released'],
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

  if (!verification.canClaimVerified) {
    return {
      version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
      itemRef,
      releaseMode: item.releaseMode,
      canIssueVerifiedAttempt: false,
      reasonCodes: verification.reasonCodes,
      evidenceRefs: verification.evidenceRefs,
      verification,
    };
  }

  const corpusValidation = validateStudyAssessmentCorpusRecord(item);
  if (!corpusValidation.valid) {
    return {
      version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
      itemRef,
      releaseMode: item.releaseMode,
      canIssueVerifiedAttempt: false,
      reasonCodes: corpusValidation.reasonCodes,
      evidenceRefs: [],
      verification,
    };
  }

  const qualityValidation = validateStudyAssessmentItemQuality(item);
  if (!qualityValidation.valid) {
    return {
      version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
      itemRef,
      releaseMode: item.releaseMode,
      canIssueVerifiedAttempt: false,
      reasonCodes: qualityValidation.reasonCodes,
      evidenceRefs: [],
      verification,
    };
  }

  const corpusReadiness = studyAssessmentCorpusReadiness();
  if (!corpusReadiness.valid) {
    return {
      version: STUDY_ASSESSMENT_GOVERNANCE_VERSION,
      itemRef,
      releaseMode: item.releaseMode,
      canIssueVerifiedAttempt: false,
      reasonCodes: ['assessment_corpus_quality_gate_failed'],
      evidenceRefs: [],
      verification,
    };
  }

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
