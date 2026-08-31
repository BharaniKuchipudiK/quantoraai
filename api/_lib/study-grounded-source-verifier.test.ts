import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDY_GROUNDED_SOURCE_VERIFIER_VERSION,
  verifyStudyGroundedSourceClaim,
} from "./study-grounded-source-verifier.js";

test("Exam Grounded verifies an exact complete statement from an admitted official source", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "reflection-law",
    mode: "exam_grounded",
    sourceRef: "https://ncert.nic.in/textbook.php?gesc1=1-10",
    claimText: "The angle of incidence is equal to the angle of reflection.",
    sourceExcerpt: "The angle of incidence is equal to the angle of reflection.",
  });

  assert.equal(result.check.status, "verified");
  assert.equal(result.check.reasonCode, "grounding_exact_support_found");
  assert.deepEqual(result.check.evidenceRefs, ["https://ncert.nic.in/textbook.php?gesc1=1-10"]);
  assert.equal(result.trace?.version, STUDY_GROUNDED_SOURCE_VERIFIER_VERSION);
  assert.equal(result.trace?.authorityId, "ncert");
  assert.equal(result.trace?.claimId, "reflection-law");
});

test("harmless Unicode and whitespace differences do not break exact support", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "temperature-spacing",
    mode: "exam_grounded",
    sourceRef: "https://cbseacademic.nic.in/reference.html",
    claimText: "Water is at 100 °C.",
    sourceExcerpt: "Water   is at 100°C.",
  });
  assert.equal(result.check.status, "verified");
});

test("caller labels cannot elevate an ordinary web source into Exam Grounded evidence", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "spoofed-authority",
    mode: "exam_grounded",
    sourceRef: "https://example.com/ncert-notes",
    claimText: "The angle of incidence is equal to the angle of reflection.",
    sourceExcerpt: "The angle of incidence is equal to the angle of reflection.",
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "grounding_canonical_source_required");
});

test("Explore mode may use a normal cited web source", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "explore-web",
    mode: "explore",
    sourceRef: "https://example.com/reference",
    claimText: "A prism can disperse white light into component colours.",
    sourceExcerpt: "A prism can disperse white light into component colours.",
  });
  assert.equal(result.check.status, "verified");
  assert.equal(result.trace?.sourceKind, "web");
});

test("authority alone never proves a claim when the retrieved statement does not support it", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "unsupported-official",
    mode: "exam_grounded",
    sourceRef: "https://ncert.nic.in/textbook.php?gesc1=1-10",
    claimText: "Concave mirrors always form upright images.",
    sourceExcerpt: "A concave mirror can form real or virtual images depending on object position.",
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "grounding_exact_support_not_found");
  assert.equal(result.trace, null);
});

test("paraphrase is deliberately insufficient rather than guessed semantic equivalence", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "paraphrase-abstain",
    mode: "exam_grounded",
    sourceRef: "https://ncert.nic.in/textbook.php?gesc1=1-10",
    claimText: "Incidence angle equals reflection angle.",
    sourceExcerpt: "The angle of incidence is equal to the angle of reflection.",
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "grounding_exact_support_not_found");
});

test("a matching substring inside a negated or misconception sentence is not verified", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "negated-context",
    mode: "exam_grounded",
    sourceRef: "https://ncert.nic.in/textbook.php?gesc1=1-10",
    claimText: "Concave mirrors always form upright images.",
    sourceExcerpt: "It is false that concave mirrors always form upright images.",
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "grounding_exact_support_not_found");
});

test("missing and tiny claims fail closed", () => {
  const missing = verifyStudyGroundedSourceClaim({
    claimId: "missing-source-excerpt",
    mode: "exam_grounded",
    sourceRef: "https://ncert.nic.in/textbook.php",
    claimText: "A meaningful curriculum fact.",
    sourceExcerpt: "",
  });
  assert.equal(missing.check.reasonCode, "grounding_source_excerpt_missing");

  const tiny = verifyStudyGroundedSourceClaim({
    claimId: "tiny",
    mode: "exam_grounded",
    sourceRef: "https://ncert.nic.in/textbook.php",
    claimText: "force",
    sourceExcerpt: "force",
  });
  assert.equal(tiny.check.reasonCode, "grounding_claim_too_short");
});

test("look-alike authority domains remain insufficient", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "lookalike",
    mode: "exam_grounded",
    sourceRef: "https://ncert.nic.in.evil.example/textbook.pdf",
    claimText: "The angle of incidence is equal to the angle of reflection.",
    sourceExcerpt: "The angle of incidence is equal to the angle of reflection.",
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "grounding_canonical_source_required");
});

test("invalid modes fail closed instead of inheriting Explore permissions", () => {
  const result = verifyStudyGroundedSourceClaim({
    claimId: "invalid-mode",
    mode: "anything" as never,
    sourceRef: "https://example.com/reference",
    claimText: "A prism can disperse white light into component colours.",
    sourceExcerpt: "A prism can disperse white light into component colours.",
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "grounding_invalid_mode");
});
