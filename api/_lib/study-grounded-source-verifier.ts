import { createHash } from "node:crypto";
import {
  classifyStudyGroundingSource,
  studyGroundingSourceAllowedForMode,
  type StudyGroundingSource,
} from "./study-grounding.js";
import type {
  StudyVerificationCheck,
  StudyVerificationMode,
} from "./study-verification.js";

export const STUDY_GROUNDED_SOURCE_VERIFIER_VERSION =
  "study-grounded-source-verifier-2026-08-31.1";

export type StudyGroundedSourceVerificationRequest = {
  claimId: string;
  mode: StudyVerificationMode;
  /** Source URL/ref that supplied the retrieved text. */
  sourceRef: string;
  /** Atomic learner-facing factual claim to support. */
  claimText: string;
  /** Text retrieved server-side (or from a reviewed corpus) from sourceRef. */
  sourceText: string;
};

export type StudyGroundedSourceVerificationTrace = {
  version: string;
  claimId: string;
  mode: StudyVerificationMode;
  sourceRef: string;
  sourceKind: StudyGroundingSource["kind"];
  authorityId: string | null;
  claimDigest: string;
  sourceTextDigest: string;
  decision: "verified";
  reasonCode: string;
};

export type StudyGroundedSourceVerificationResult = {
  check: StudyVerificationCheck;
  trace: StudyGroundedSourceVerificationTrace | null;
};

const MAX_CLAIM_CHARS = 2_000;
const MAX_SOURCE_TEXT_CHARS = 80_000;
const MIN_CLAIM_CHARS = 8;

function cleanId(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 200)
    : "";
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Conservative textual canonicalization only. This is intentionally not a
 * semantic similarity algorithm: V3 verifies exact support after harmless
 * Unicode/spacing normalization and abstains on paraphrases.
 */
function canonicalSupportText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, "-")
    .toLowerCase()
    .replace(/\s*°\s*/g, "°")
    .replace(/\s+/g, " ")
    .trim();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function insufficient(reasonCode: string): StudyGroundedSourceVerificationResult {
  return {
    check: {
      verifier: "grounded_source",
      status: "insufficient",
      evidenceRefs: [],
      reasonCode,
    },
    trace: null,
  };
}

function buildVerified(
  claimId: string,
  mode: StudyVerificationMode,
  source: StudyGroundingSource,
  claim: string,
  sourceText: string,
): StudyGroundedSourceVerificationResult {
  const trace: StudyGroundedSourceVerificationTrace = {
    version: STUDY_GROUNDED_SOURCE_VERIFIER_VERSION,
    claimId,
    mode,
    sourceRef: source.ref,
    sourceKind: source.kind,
    authorityId: source.authorityId,
    claimDigest: digest(claim),
    sourceTextDigest: digest(sourceText),
    decision: "verified",
    reasonCode: "grounding_exact_support_found",
  };

  return {
    check: {
      verifier: "grounded_source",
      status: "verified",
      // The verification resolver additionally binds this ref to a source that
      // the plan admitted. The hash lives in the trace, while the citation stays
      // navigable and source-shaped.
      evidenceRefs: [source.ref],
      reasonCode: trace.reasonCode,
    },
    trace,
  };
}

/**
 * Deterministically verifies the narrow grounding case V3 can prove safely:
 * an atomic claim appears verbatim after harmless Unicode/spacing normalization
 * in text retrieved from an authority admitted for the current Study mode.
 *
 * This function does not fetch URLs and does not treat URL authority as semantic
 * support. Callers must pass text obtained server-side from `sourceRef` (or from
 * a reviewed corpus bound to that ref). Paraphrase, entailment, contradiction,
 * OCR uncertainty, or missing source text return `insufficient` rather than a
 * guessed verdict.
 */
export function verifyStudyGroundedSourceClaim(
  request: StudyGroundedSourceVerificationRequest,
): StudyGroundedSourceVerificationResult {
  const claimId = cleanId(request?.claimId);
  if (!claimId) return insufficient("grounding_invalid_claim_id");

  const source = classifyStudyGroundingSource({ ref: request?.sourceRef });
  if (!source) return insufficient("grounding_invalid_source_ref");
  if (!studyGroundingSourceAllowedForMode(source, request?.mode)) {
    return insufficient(request?.mode === "exam_grounded"
      ? "grounding_canonical_source_required"
      : "grounding_citable_source_required");
  }

  const rawClaim = cleanText(request?.claimText, MAX_CLAIM_CHARS);
  const rawSourceText = cleanText(request?.sourceText, MAX_SOURCE_TEXT_CHARS);
  if (!rawClaim) return insufficient("grounding_claim_text_missing");
  if (!rawSourceText) return insufficient("grounding_source_text_missing");

  const claim = canonicalSupportText(rawClaim);
  const sourceText = canonicalSupportText(rawSourceText);
  if (claim.length < MIN_CLAIM_CHARS) return insufficient("grounding_claim_too_short");
  if (!sourceText.includes(claim)) {
    return insufficient("grounding_exact_support_not_found");
  }

  return buildVerified(claimId, request.mode, source, claim, sourceText);
}
