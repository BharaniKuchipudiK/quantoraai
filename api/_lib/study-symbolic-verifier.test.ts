import assert from "node:assert/strict";
import test from "node:test";
import { verifyStudySymbolicClaim } from "./study-symbolic-verifier.js";

function verify(overrides: Partial<Parameters<typeof verifyStudySymbolicClaim>[0]> = {}) {
  return verifyStudySymbolicClaim({
    claimId: "symbolic-test",
    actual: "(x + 1)^2",
    expected: "x^2 + 2*x + 1",
    relation: "expression",
    domain: "real",
    variables: ["x"],
    ...overrides,
  });
}

test("expands polynomial identities exactly with auditable evidence", () => {
  const result = verify();
  assert.equal(result.check.status, "verified");
  assert.equal(result.check.reasonCode, "symbolic_exact_equivalence");
  assert.match(result.check.evidenceRefs?.[0] || "", /^quantora:symbolic:/);
  assert.equal(result.trace?.relation, "expression");
});

test("uses exact rational arithmetic instead of floating-point sampling", () => {
  const result = verify({ actual: "x/2 + x/2", expected: "x" });
  assert.equal(result.check.status, "verified");
});

test("uses standard exponent precedence for unary minus", () => {
  const result = verify({ actual: "-x^2", expected: "-(x^2)" });
  assert.equal(result.check.status, "verified");

  const different = verify({ actual: "-x^2", expected: "(-x)^2" });
  assert.equal(different.check.status, "rejected");
});

test("rejects a provably different polynomial expression", () => {
  const result = verify({ actual: "x + 1", expected: "x - 1" });
  assert.equal(result.check.status, "rejected");
  assert.equal(result.check.reasonCode, "symbolic_not_equivalent");
  assert.ok(result.trace);
});

test("proportional equations verify under exact zero-set normalization", () => {
  const result = verify({
    actual: "2*x + 2 = 4",
    expected: "x + 1 = 2",
    relation: "equation",
  });
  assert.equal(result.check.status, "verified");
});

test("non-proportional equations remain insufficient rather than falsely rejected", () => {
  const result = verify({
    actual: "x^2 = 0",
    expected: "x = 0",
    relation: "equation",
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "symbolic_equation_equivalence_not_proven");
});

test("undeclared variables never enter verified algebra", () => {
  const result = verify({ actual: "x + y", expected: "y + x", variables: ["x"] });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "symbolic_undeclared_variable");
});

test("domain must be explicit", () => {
  const invalid = verifyStudySymbolicClaim({
    claimId: "invalid-domain",
    actual: "x + 1",
    expected: "1 + x",
    relation: "expression",
    domain: "" as any,
    variables: ["x"],
  });
  assert.equal(invalid.check.status, "insufficient");
  assert.equal(invalid.check.reasonCode, "symbolic_domain_required");
});

test("cancellation that changes the domain requires an explicit non-zero assumption", () => {
  const withoutAssumption = verify({ actual: "x/x", expected: "1" });
  assert.equal(withoutAssumption.check.status, "insufficient");
  assert.equal(withoutAssumption.check.reasonCode, "symbolic_domain_assumption_required");

  const withAssumption = verify({
    actual: "x/x",
    expected: "1",
    assumptions: { nonZeroExpressions: ["x"] },
  });
  assert.equal(withAssumption.check.status, "verified");
});

test("equivalent rational expressions preserve matching domain constraints without extra assumptions", () => {
  const result = verify({ actual: "1/x", expected: "2/(2*x)" });
  assert.equal(result.check.status, "verified");
});

test("unsupported transcendental syntax returns insufficient rather than heuristic success", () => {
  const result = verify({ actual: "sin(x)^2 + 1", expected: "1 + sin(x)^2" });
  assert.equal(result.check.status, "insufficient");
  assert.match(result.check.reasonCode || "", /^symbolic_/);
});

test("symbolic exponents outside the exact subset remain insufficient", () => {
  const result = verify({ actual: "x^9", expected: "x*x*x*x*x*x*x*x*x" });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "symbolic_exponent_unsupported");
});

test("impossible non-zero assumptions are rejected", () => {
  const result = verify({
    actual: "x/x",
    expected: "1",
    assumptions: { nonZeroExpressions: ["0"] },
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "symbolic_impossible_nonzero_assumption");
});
