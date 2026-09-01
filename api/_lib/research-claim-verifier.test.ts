import assert from "node:assert/strict";
import test from "node:test";
import {
  RESEARCH_CLAIM_VERIFIER_VERSION,
  admitResearchSourceUrl,
  verifyResearchClaimEvidence,
} from "./research-claim-verifier.js";

const CLAIM = "Utility-scale solar undercut new nuclear on cost in every 2024 market survey.";
const EXCERPT = "In all twelve market surveys published in 2024, utility-scale solar generation cost less per megawatt-hour than newly built nuclear capacity.";
const SOURCE_TEXT = `Energy report.\nBackground follows. ${EXCERPT} Further discussion continues here.`;

const request = (overrides = {}) => ({
  claimId: "finding-1",
  claimText: CLAIM,
  sourceUrl: "https://www.example.com/report",
  sourceText: SOURCE_TEXT,
  proposedExcerpt: EXCERPT,
  stance: "supports" as const,
  ...overrides,
});

test("a supporting excerpt found verbatim in the source verifies as supported", () => {
  const result = verifyResearchClaimEvidence(request());
  assert.equal(result.standing, "supported");
  assert.equal(result.reasonCode, "supporting_excerpt_verified_in_source");
  assert.equal(result.excerpt, EXCERPT);
  assert.equal(result.sourceUrl, "https://www.example.com/report");
  assert.equal(result.trace?.version, RESEARCH_CLAIM_VERIFIER_VERSION);
});

test("a contradicting excerpt found verbatim marks the claim contested", () => {
  const result = verifyResearchClaimEvidence(request({ stance: "contradicts" }));
  assert.equal(result.standing, "contested");
  assert.equal(result.reasonCode, "contradicting_excerpt_verified_in_source");
});

test("an excerpt the source does not contain is unverified, whatever the model says", () => {
  const result = verifyResearchClaimEvidence(request({
    proposedExcerpt: "Nuclear power was cheaper than solar in every market survey published during 2024.",
  }));
  assert.equal(result.standing, "unverified");
  assert.equal(result.reasonCode, "excerpt_not_in_source");
  assert.equal(result.excerpt, null);
  assert.equal(result.trace, null);
});

test("harmless quote, dash, case and spacing differences do not defeat verification", () => {
  const curly = EXCERPT.replace("per megawatt-hour", "per megawatt—hour").toUpperCase();
  const result = verifyResearchClaimEvidence(request({
    proposedExcerpt: curly,
    sourceText: `Intro.\n  ${EXCERPT.replace(/\s+/g, "  ")}\nOutro.`,
  }));
  assert.equal(result.standing, "supported");
});

test("oversized inputs are rejected, never truncated into a verdict", () => {
  assert.equal(verifyResearchClaimEvidence(request({ claimText: "x".repeat(501) })).reasonCode, "claim_too_long");
  assert.equal(verifyResearchClaimEvidence(request({ proposedExcerpt: "y".repeat(1_300) })).reasonCode, "excerpt_too_long");
  assert.equal(
    verifyResearchClaimEvidence(request({ sourceText: "z".repeat(800_001) })).reasonCode,
    "source_text_too_long",
  );
});

test("short or missing pieces fail closed with named reasons", () => {
  assert.equal(verifyResearchClaimEvidence(request({ claimId: "  " })).reasonCode, "claim_id_missing");
  assert.equal(verifyResearchClaimEvidence(request({ claimText: "Too short." })).reasonCode, "claim_too_short");
  assert.equal(verifyResearchClaimEvidence(request({ proposedExcerpt: "A phrase match." })).reasonCode, "excerpt_too_short");
  assert.equal(verifyResearchClaimEvidence(request({ sourceText: "   " })).reasonCode, "source_text_missing");
  assert.equal(verifyResearchClaimEvidence(request({ stance: "maybe" as never })).reasonCode, "stance_invalid");
});

test("URL admission allows only public https on the default port", () => {
  assert.equal(admitResearchSourceUrl("https://www.nature.com/articles/x123").ok, true);
  assert.equal(admitResearchSourceUrl("http://www.nature.com/a").ok, false);
  assert.deepEqual(admitResearchSourceUrl("https://user:pw@example.com/a"), {
    ok: false, reason: "source_url_has_credentials",
  });
  assert.deepEqual(admitResearchSourceUrl("https://example.com:8443/a"), {
    ok: false, reason: "source_url_nonstandard_port",
  });
  assert.deepEqual(admitResearchSourceUrl("https://localhost/admin"), {
    ok: false, reason: "source_url_internal_host",
  });
  assert.deepEqual(admitResearchSourceUrl("https://vault.internal/keys"), {
    ok: false, reason: "source_url_internal_host",
  });
  assert.deepEqual(admitResearchSourceUrl("https://10.0.0.1/latest"), {
    ok: false, reason: "source_url_ip_literal",
  });
  assert.deepEqual(admitResearchSourceUrl("https://[::1]/x"), {
    ok: false, reason: "source_url_ip_literal",
  });
  assert.deepEqual(admitResearchSourceUrl("https://intranet/portal"), {
    ok: false, reason: "source_url_not_public",
  });
  assert.equal(admitResearchSourceUrl("").ok, false);
  assert.equal(admitResearchSourceUrl(`https://example.com/${"a".repeat(2_000)}`).ok, false);
});

test("a claim whose evidence URL fails admission is unverified with that reason", () => {
  const result = verifyResearchClaimEvidence(request({ sourceUrl: "https://169.254.169.254/latest" }));
  assert.equal(result.standing, "unverified");
  assert.equal(result.reasonCode, "source_url_ip_literal");
});
