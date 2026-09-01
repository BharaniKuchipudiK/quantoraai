import { createHash } from "node:crypto";

/**
 * Deterministic core of the Research desk's claim verification.
 *
 * The Study grounded-source verifier proved the narrow case it could prove
 * safely: claim text exactly equals a curated support statement. Research
 * claims are paraphrases of the open web, so exact claim equality would
 * verify nothing. This verifier therefore proves a different, honest
 * contract — PROVENANCE, not entailment:
 *
 *   "This evidence passage really appears, verbatim, in that source."
 *
 * A model proposes the passage and judges the stance (supports/contradicts);
 * this module confirms the passage exists in the server-fetched source text
 * after harmless Unicode/spacing normalization, and refuses everything else.
 * A claim whose proposed evidence cannot be found verbatim is UNVERIFIED —
 * never "probably fine". The board's badge wording must match this contract:
 * "supporting quote verified in source", not "claim proven true".
 *
 * Inputs above the policy caps are rejected, never truncated: truncating the
 * source text could discard the very passage (or a negating suffix) the
 * decision depends on.
 */

export const RESEARCH_CLAIM_VERIFIER_VERSION = "research-claim-verifier-2026-09-01.1";

export type ResearchClaimStance = "supports" | "contradicts";

export type ResearchClaimStanding = "supported" | "contested" | "unverified";

export type ResearchClaimVerificationRequest = {
  claimId: string;
  /** The finding, as shown on the board. */
  claimText: string;
  /** The source the evidence excerpt allegedly comes from. */
  sourceUrl: string;
  /** Full plain text of that source, fetched server-side. */
  sourceText: string;
  /** Complete evidence passage the model proposes, to be shown to the user. */
  proposedExcerpt: string;
  /** The model's judgement of what the passage does to the claim. */
  stance: ResearchClaimStance;
};

export type ResearchClaimVerificationResult = {
  claimId: string;
  standing: ResearchClaimStanding;
  reasonCode: string;
  /** Present only when the excerpt was verified verbatim in the source. */
  excerpt: string | null;
  sourceUrl: string | null;
  trace: {
    version: string;
    claimDigest: string;
    excerptDigest: string;
    sourceTextDigest: string;
  } | null;
};

const MIN_CLAIM_CHARS = 12;
const MAX_CLAIM_CHARS = 500;
/** An evidence passage must be a real statement, not a phrase match. */
const MIN_EXCERPT_CHARS = 40;
const MAX_EXCERPT_CHARS = 1_200;
const MAX_SOURCE_TEXT_CHARS = 800_000;
const MAX_URL_CHARS = 2_000;

/**
 * Where the desk is allowed to fetch. https to a public, dotted DNS name on
 * the default port, with no embedded credentials. IP literals, localhost and
 * internal-looking hostnames are refused outright — a cited source that needs
 * any of those is not a citable source. Hostname checks cannot rule out DNS
 * pointing a public name at a private address; the fetch layer keeps its own
 * limits (timeouts, size caps, re-admitting every redirect hop) on top.
 */
const INTERNAL_HOST = /\.(?:local|internal|lan|home|corp|intranet)$/i;
const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export type ResearchSourceAdmission = { ok: boolean; url?: string; reason?: string };

export function admitResearchSourceUrl(value: unknown): ResearchSourceAdmission {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: false, reason: "source_url_missing" };
  if (raw.length > MAX_URL_CHARS) return { ok: false, reason: "source_url_too_long" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "source_url_invalid" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "source_url_not_https" };
  if (url.username || url.password) return { ok: false, reason: "source_url_has_credentials" };
  if (url.port && url.port !== "443") return { ok: false, reason: "source_url_nonstandard_port" };

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "source_url_internal_host" };
  }
  if (INTERNAL_HOST.test(host)) return { ok: false, reason: "source_url_internal_host" };
  if (IPV4_LITERAL.test(host) || host.startsWith("[")) {
    return { ok: false, reason: "source_url_ip_literal" };
  }
  if (!host.includes(".")) return { ok: false, reason: "source_url_not_public" };

  return { ok: true, url: url.toString() };
}

/**
 * Conservative textual canonicalization, shared with the Study verifier's
 * philosophy: harmless Unicode/quote/dash/whitespace normalization only,
 * never anything resembling semantic similarity.
 */
function canonicalText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function unverified(claimId: string, reasonCode: string): ResearchClaimVerificationResult {
  return {
    claimId,
    standing: "unverified",
    reasonCode,
    excerpt: null,
    sourceUrl: null,
    trace: null,
  };
}

export function verifyResearchClaimEvidence(
  request: ResearchClaimVerificationRequest,
): ResearchClaimVerificationResult {
  const claimId = typeof request?.claimId === "string"
    ? request.claimId.trim().replace(/\s+/g, " ").slice(0, 200)
    : "";
  if (!claimId) return unverified("", "claim_id_missing");

  const stance = request?.stance;
  if (stance !== "supports" && stance !== "contradicts") {
    return unverified(claimId, "stance_invalid");
  }

  const admission = admitResearchSourceUrl(request?.sourceUrl);
  if (!admission.ok || !admission.url) return unverified(claimId, admission.reason || "source_url_invalid");

  const rawClaim = typeof request?.claimText === "string" ? request.claimText.trim() : "";
  const rawExcerpt = typeof request?.proposedExcerpt === "string" ? request.proposedExcerpt.trim() : "";
  const rawSource = typeof request?.sourceText === "string" ? request.sourceText : "";

  if (rawClaim.length < MIN_CLAIM_CHARS) return unverified(claimId, "claim_too_short");
  if (rawClaim.length > MAX_CLAIM_CHARS) return unverified(claimId, "claim_too_long");
  if (rawExcerpt.length < MIN_EXCERPT_CHARS) return unverified(claimId, "excerpt_too_short");
  if (rawExcerpt.length > MAX_EXCERPT_CHARS) return unverified(claimId, "excerpt_too_long");
  if (!rawSource.trim()) return unverified(claimId, "source_text_missing");
  if (rawSource.length > MAX_SOURCE_TEXT_CHARS) return unverified(claimId, "source_text_too_long");

  const excerpt = canonicalText(rawExcerpt);
  const sourceText = canonicalText(rawSource);
  if (excerpt.length < MIN_EXCERPT_CHARS) return unverified(claimId, "excerpt_too_short");
  if (!sourceText.includes(excerpt)) {
    return unverified(claimId, "excerpt_not_in_source");
  }

  return {
    claimId,
    standing: stance === "supports" ? "supported" : "contested",
    reasonCode: stance === "supports"
      ? "supporting_excerpt_verified_in_source"
      : "contradicting_excerpt_verified_in_source",
    // The original casing is what the user reads; verification ran on the
    // canonical form of the same characters.
    excerpt: rawExcerpt,
    sourceUrl: admission.url,
    trace: {
      version: RESEARCH_CLAIM_VERIFIER_VERSION,
      claimDigest: digest(canonicalText(rawClaim)),
      excerptDigest: digest(excerpt),
      sourceTextDigest: digest(sourceText),
    },
  };
}
