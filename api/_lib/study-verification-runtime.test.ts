import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyVerificationPlan } from "./study-verification.js";
import { executeStudyVerificationPlan } from "./study-verification-runtime.js";

test("numeric plan resolves verified through the deterministic runtime", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "velocity-check",
    claimKind: "numeric",
    mode: "exam_grounded",
  });
  const result = executeStudyVerificationPlan({
    plan,
    numeric: {
      claimId: "caller-cannot-rebind-this",
      actual: { value: 36, unit: "km/h" },
      expected: { value: 10, unit: "m/s" },
    },
  });
  assert.equal(result.outcome.decision, "verified");
  assert.equal(result.outcome.canClaimVerified, true);
  assert.equal(result.numericTrace?.claimId, "velocity-check");
  assert.equal(result.checks.find((check) => check.verifier === "numeric")?.status, "verified");
});

test("numeric plan without numeric data remains insufficient", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "missing-number",
    claimKind: "numeric",
    mode: "exam_grounded",
  });
  const result = executeStudyVerificationPlan({ plan });
  assert.equal(result.outcome.decision, "insufficient");
  assert.equal(result.outcome.canClaimVerified, false);
  assert.ok(result.outcome.reasonCodes.includes("numeric_input_missing"));
});

test("symbolic plan resolves an exact identity through the deterministic runtime", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "symbolic-check",
    claimKind: "symbolic",
    mode: "exam_grounded",
  });
  const result = executeStudyVerificationPlan({
    plan,
    symbolic: {
      claimId: "caller-cannot-rebind-this",
      actual: "(x + 1)^2",
      expected: "x^2 + 2*x + 1",
      relation: "expression",
      domain: "real",
      variables: ["x"],
    },
  });
  assert.equal(result.outcome.decision, "verified");
  assert.equal(result.outcome.canClaimVerified, true);
  assert.equal(result.symbolicTrace?.claimId, "symbolic-check");
  assert.equal(result.checks.find((check) => check.verifier === "symbolic")?.status, "verified");
});

test("symbolic plan without symbolic data remains insufficient", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "missing-symbolic",
    claimKind: "symbolic",
    mode: "exam_grounded",
  });
  const result = executeStudyVerificationPlan({ plan });
  assert.equal(result.outcome.decision, "insufficient");
  assert.equal(result.outcome.canClaimVerified, false);
  assert.ok(result.outcome.reasonCodes.includes("symbolic_input_missing"));
});

test("Exam Grounded curriculum facts resolve through the deterministic grounding runtime", () => {
  const sourceRef = "https://ncert.nic.in/textbook.php?gesc1=1-10";
  const plan = buildStudyVerificationPlan({
    claimId: "reflection-law",
    claimKind: "curriculum_fact",
    mode: "exam_grounded",
    groundingSources: [{ ref: sourceRef }],
  });
  const result = executeStudyVerificationPlan({
    plan,
    grounding: {
      claimId: "caller-cannot-rebind-this",
      mode: "explore",
      sourceRef,
      claimText: "The angle of incidence is equal to the angle of reflection.",
      sourceText: "The angle of incidence is equal to the angle of reflection.",
    },
  });
  assert.equal(result.outcome.decision, "verified");
  assert.equal(result.outcome.canClaimVerified, true);
  assert.equal(result.groundingTrace?.claimId, "reflection-law");
  assert.equal(result.groundingTrace?.mode, "exam_grounded");
  assert.equal(result.groundingTrace?.authorityId, "ncert");
  assert.deepEqual(result.outcome.evidenceRefs, [sourceRef]);
});

test("curriculum fact without grounding input remains insufficient", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "missing-grounding",
    claimKind: "curriculum_fact",
    mode: "exam_grounded",
    groundingSources: [{ ref: "https://ncert.nic.in/textbook.php" }],
  });
  const result = executeStudyVerificationPlan({ plan });
  assert.equal(result.outcome.decision, "insufficient");
  assert.ok(result.outcome.reasonCodes.includes("grounding_input_missing"));
});

test("grounding runtime cannot verify against a canonical source absent from the plan", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "wrong-admitted-source",
    claimKind: "curriculum_fact",
    mode: "exam_grounded",
    groundingSources: [{ ref: "https://ncert.nic.in/textbook.php" }],
  });
  const result = executeStudyVerificationPlan({
    plan,
    grounding: {
      claimId: "ignored",
      mode: "exam_grounded",
      sourceRef: "https://cbseacademic.nic.in/reference.html",
      claimText: "The angle of incidence is equal to the angle of reflection.",
      sourceText: "The angle of incidence is equal to the angle of reflection.",
    },
  });
  assert.equal(result.checks.find((check) => check.verifier === "grounded_source")?.status, "verified");
  assert.equal(result.outcome.decision, "insufficient");
  assert.equal(result.outcome.canClaimVerified, false);
  assert.ok(result.outcome.reasonCodes.includes("grounded_source_unbound_evidence"));
  assert.deepEqual(result.outcome.evidenceRefs, []);
});

test("official source authority cannot rescue unsupported source text", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "unsupported-curriculum-fact",
    claimKind: "curriculum_fact",
    mode: "exam_grounded",
    groundingSources: [{ ref: "https://ncert.nic.in/textbook.php" }],
  });
  const result = executeStudyVerificationPlan({
    plan,
    grounding: {
      claimId: "ignored",
      mode: "exam_grounded",
      sourceRef: "https://ncert.nic.in/textbook.php",
      claimText: "Concave mirrors always form upright images.",
      sourceText: "Concave mirrors can form different image types depending on object position.",
    },
  });
  assert.equal(result.outcome.decision, "insufficient");
  assert.ok(result.outcome.reasonCodes.includes("grounding_exact_support_not_found"));
});

test("reviewed assessment plan remains verified through the shared runtime", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "assessment-key:item@1",
    claimKind: "assessment_key",
    mode: "exam_grounded",
    assessmentReviewStatus: "approved",
  });
  const result = executeStudyVerificationPlan({
    plan,
    reviewedAssessment: {
      reviewStatus: "approved",
      evidenceRef: "quantora:study-assessment-bank:item@1",
    },
  });
  assert.equal(result.outcome.decision, "verified");
  assert.equal(result.outcome.canClaimVerified, true);
  assert.deepEqual(result.outcome.evidenceRefs, ["quantora:study-assessment-bank:item@1"]);
});

test("approved review without auditable evidence is still insufficient", () => {
  const plan = buildStudyVerificationPlan({
    claimId: "assessment-key:item@1",
    claimKind: "assessment_key",
    mode: "exam_grounded",
    assessmentReviewStatus: "approved",
  });
  const result = executeStudyVerificationPlan({
    plan,
    reviewedAssessment: { reviewStatus: "approved" },
  });
  assert.equal(result.outcome.decision, "insufficient");
  assert.equal(result.outcome.canClaimVerified, false);
  assert.ok(result.outcome.reasonCodes.includes("assessment_item_missing_review_evidence"));
});
