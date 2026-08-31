import {
  resolveStudyVerification,
  type StudyAssessmentReviewStatus,
  type StudyVerificationCheck,
  type StudyVerificationOutcome,
  type StudyVerificationPlan,
  type StudyVerifierKind,
} from "./study-verification.js";
import {
  verifyStudyNumericClaim,
  type StudyNumericVerificationRequest,
  type StudyNumericVerificationTrace,
} from "./study-numeric-verifier.js";

export type StudyReviewedAssessmentVerificationInput = {
  reviewStatus: StudyAssessmentReviewStatus;
  evidenceRef?: string | null;
};

export type StudyVerificationRuntimeRequest = {
  plan: StudyVerificationPlan;
  numeric?: StudyNumericVerificationRequest | null;
  reviewedAssessment?: StudyReviewedAssessmentVerificationInput | null;
};

export type StudyVerificationRuntimeResult = {
  outcome: StudyVerificationOutcome;
  checks: StudyVerificationCheck[];
  numericTrace: StudyNumericVerificationTrace | null;
};

function insufficient(verifier: StudyVerifierKind, reasonCode: string): StudyVerificationCheck {
  return { verifier, status: "insufficient", evidenceRefs: [], reasonCode };
}

function reviewedAssessmentCheck(
  input: StudyReviewedAssessmentVerificationInput | null | undefined,
): StudyVerificationCheck {
  if (!input) return insufficient("reviewed_assessment", "reviewed_assessment_input_missing");
  const evidenceRef = typeof input.evidenceRef === "string" ? input.evidenceRef.trim() : "";
  if (input.reviewStatus !== "approved") {
    return {
      verifier: "reviewed_assessment",
      status: "rejected",
      evidenceRefs: [],
      reasonCode: "assessment_item_not_approved",
    };
  }
  return {
    verifier: "reviewed_assessment",
    status: "verified",
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
    reasonCode: evidenceRef ? "assessment_item_approved" : "assessment_item_missing_review_evidence",
  };
}

/**
 * Executes only verifier implementations that are actually available.
 *
 * Unimplemented required verifier kinds return `insufficient`; they are never
 * silently treated as success. This runtime is the single bridge between the
 * verification plan and concrete verifier implementations.
 */
export function executeStudyVerificationPlan(
  request: StudyVerificationRuntimeRequest,
): StudyVerificationRuntimeResult {
  const plan = request.plan;
  const checks: StudyVerificationCheck[] = [];
  let numericTrace: StudyNumericVerificationTrace | null = null;
  const requested = [...new Set([...plan.required, ...plan.optional])];

  for (const verifier of requested) {
    if (verifier === "numeric") {
      if (!request.numeric) {
        if (plan.required.includes("numeric")) {
          checks.push(insufficient("numeric", "numeric_input_missing"));
        }
        continue;
      }
      const result = verifyStudyNumericClaim({ ...request.numeric, claimId: plan.claimId });
      checks.push(result.check);
      numericTrace = result.trace;
      continue;
    }

    if (verifier === "reviewed_assessment") {
      checks.push(reviewedAssessmentCheck(request.reviewedAssessment));
      continue;
    }

    if (plan.required.includes(verifier)) {
      checks.push(insufficient(verifier, `${verifier}_implementation_unavailable`));
    }
  }

  return {
    outcome: resolveStudyVerification(plan, checks),
    checks,
    numericTrace,
  };
}
