export const STUDY_VERIFICATION_VERSION = 'study-verification-2026-08-31.1';

export type StudyVerificationMode = 'exam_grounded' | 'explore';

export type StudyClaimKind =
  | 'numeric'
  | 'symbolic'
  | 'formal_proof'
  | 'curriculum_fact'
  | 'assessment_key';

export type StudyVerifierKind =
  | 'numeric'
  | 'symbolic'
  | 'formal'
  | 'grounded_source'
  | 'reviewed_assessment';

export type StudyVerificationCheckStatus =
  | 'verified'
  | 'rejected'
  | 'insufficient'
  | 'not_applicable';

export type StudyVerificationDecision = 'verified' | 'rejected' | 'insufficient';

export type StudyGroundingSourceKind =
  | 'official'
  | 'open_licensed'
  | 'quantora_reviewed'
  | 'connected_source'
  | 'web';

export type StudyGroundingSource = {
  ref: string;
  kind: StudyGroundingSourceKind;
};

export type StudyAssessmentReviewStatus = 'approved' | 'draft' | 'rejected' | 'unknown';

export type StudyVerificationRequest = {
  claimId: string;
  claimKind: StudyClaimKind;
  mode: StudyVerificationMode;
  subject?: string | null;
  formalizable?: boolean;
  groundingSources?: StudyGroundingSource[] | null;
  assessmentReviewStatus?: StudyAssessmentReviewStatus | null;
};

export type StudyVerificationPlan = {
  version: string;
  claimId: string;
  claimKind: StudyClaimKind;
  mode: StudyVerificationMode;
  required: StudyVerifierKind[];
  optional: StudyVerifierKind[];
  blockers: string[];
  canAttempt: boolean;
};

export type StudyVerificationCheck = {
  verifier: StudyVerifierKind;
  status: StudyVerificationCheckStatus;
  evidenceRefs?: string[] | null;
  reasonCode?: string | null;
};

export type StudyVerificationOutcome = {
  version: string;
  claimId: string;
  decision: StudyVerificationDecision;
  canClaimVerified: boolean;
  reasonCodes: string[];
  evidenceRefs: string[];
};

const EXAM_GROUNDED_SOURCE_KINDS = new Set<StudyGroundingSourceKind>([
  'official',
  'open_licensed',
  'quantora_reviewed',
]);

function clean(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizedSources(input: StudyGroundingSource[] | null | undefined): StudyGroundingSource[] {
  if (!Array.isArray(input)) return [];
  const result: StudyGroundingSource[] = [];
  const seen = new Set<string>();
  for (const source of input) {
    const ref = clean(source?.ref, 1000);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    result.push({ ref, kind: source.kind });
  }
  return result;
}

function hasAllowedExamSource(sources: StudyGroundingSource[]): boolean {
  return sources.some((source) => EXAM_GROUNDED_SOURCE_KINDS.has(source.kind));
}

/**
 * Creates a deterministic verification plan for one atomic learner-facing claim.
 *
 * This module intentionally does not call SymPy, Lean, a model, or a retrieval
 * provider. It defines the trust contract those implementations must satisfy.
 * A caller may propose a claim freely; it may only label the claim verified
 * after every required verifier has returned auditable evidence.
 */
export function buildStudyVerificationPlan(input: StudyVerificationRequest): StudyVerificationPlan {
  const claimId = clean(input?.claimId, 200);
  const required: StudyVerifierKind[] = [];
  const optional: StudyVerifierKind[] = [];
  const blockers: string[] = [];
  const sources = normalizedSources(input?.groundingSources);

  if (!claimId) blockers.push('invalid_claim_id');

  switch (input?.claimKind) {
    case 'numeric':
      required.push('numeric');
      optional.push('symbolic');
      break;
    case 'symbolic':
      required.push('symbolic');
      optional.push('numeric');
      break;
    case 'formal_proof':
      if (input.formalizable === true) required.push('formal');
      else blockers.push('formalization_required');
      break;
    case 'curriculum_fact':
      required.push('grounded_source');
      if (input.mode === 'exam_grounded' && !hasAllowedExamSource(sources)) {
        blockers.push('canonical_source_required');
      }
      break;
    case 'assessment_key':
      required.push('reviewed_assessment');
      if (input.assessmentReviewStatus !== 'approved') {
        blockers.push('assessment_not_approved');
      }
      break;
    default:
      blockers.push('unsupported_claim_kind');
      break;
  }

  return {
    version: STUDY_VERIFICATION_VERSION,
    claimId,
    claimKind: input?.claimKind,
    mode: input?.mode,
    required: unique(required),
    optional: unique(optional.filter((verifier) => !required.includes(verifier))),
    blockers: unique(blockers),
    canAttempt: blockers.length === 0 && required.length > 0,
  };
}

function normalizedEvidenceRefs(check: StudyVerificationCheck): string[] {
  if (!Array.isArray(check?.evidenceRefs)) return [];
  return unique(check.evidenceRefs.map((ref) => clean(ref, 1000)).filter(Boolean));
}

/**
 * Resolves verifier outputs conservatively.
 *
 * - Any required rejection rejects the claim.
 * - Missing/insufficient required checks leave the claim insufficient.
 * - A required check cannot count as verified without an evidence reference.
 * - Optional checks can add evidence but can never rescue a failed requirement.
 */
export function resolveStudyVerification(
  plan: StudyVerificationPlan,
  checks: StudyVerificationCheck[] | null | undefined,
): StudyVerificationOutcome {
  const rows = Array.isArray(checks) ? checks : [];
  const byVerifier = new Map<StudyVerifierKind, StudyVerificationCheck>();
  for (const check of rows) {
    if (!check || byVerifier.has(check.verifier)) continue;
    byVerifier.set(check.verifier, check);
  }

  const evidenceRefs: string[] = [];
  const reasonCodes = [...plan.blockers];

  if (plan.blockers.length || !plan.required.length) {
    return {
      version: STUDY_VERIFICATION_VERSION,
      claimId: plan.claimId,
      decision: 'insufficient',
      canClaimVerified: false,
      reasonCodes: unique(reasonCodes.length ? reasonCodes : ['no_required_verifier']),
      evidenceRefs: [],
    };
  }

  let hasInsufficient = false;
  for (const verifier of plan.required) {
    const check = byVerifier.get(verifier);
    if (!check) {
      hasInsufficient = true;
      reasonCodes.push(`missing_${verifier}`);
      continue;
    }
    const refs = normalizedEvidenceRefs(check);
    evidenceRefs.push(...refs);
    if (check.status === 'rejected') {
      reasonCodes.push(check.reasonCode || `${verifier}_rejected`);
      return {
        version: STUDY_VERIFICATION_VERSION,
        claimId: plan.claimId,
        decision: 'rejected',
        canClaimVerified: false,
        reasonCodes: unique(reasonCodes),
        evidenceRefs: unique(evidenceRefs),
      };
    }
    if (check.status !== 'verified' || refs.length === 0) {
      hasInsufficient = true;
      reasonCodes.push(check.reasonCode || (check.status === 'verified'
        ? `${verifier}_missing_evidence`
        : `${verifier}_insufficient`));
    }
  }

  for (const verifier of plan.optional) {
    const check = byVerifier.get(verifier);
    if (check?.status === 'verified') evidenceRefs.push(...normalizedEvidenceRefs(check));
  }

  if (hasInsufficient) {
    return {
      version: STUDY_VERIFICATION_VERSION,
      claimId: plan.claimId,
      decision: 'insufficient',
      canClaimVerified: false,
      reasonCodes: unique(reasonCodes),
      evidenceRefs: unique(evidenceRefs),
    };
  }

  return {
    version: STUDY_VERIFICATION_VERSION,
    claimId: plan.claimId,
    decision: 'verified',
    canClaimVerified: true,
    reasonCodes: ['all_required_checks_verified'],
    evidenceRefs: unique(evidenceRefs),
  };
}
