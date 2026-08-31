import assert from "node:assert/strict";
import test from "node:test";
import { verifyStudyNumericClaim } from "./study-numeric-verifier.js";

function verify(overrides: Record<string, unknown> = {}) {
  return verifyStudyNumericClaim({
    claimId: "numeric-test",
    actual: { value: 10, unit: "m/s" },
    expected: { value: 10, unit: "m/s" },
    ...overrides,
  } as any);
}

test("exact dimensionless equality verifies with auditable evidence", () => {
  const result = verify({
    actual: { value: 0.5 },
    expected: { value: 0.5 },
  });
  assert.equal(result.check.status, "verified");
  assert.equal(result.check.reasonCode, "numeric_within_tolerance");
  assert.equal(result.trace?.dimension, "dimensionless");
  assert.match(result.check.evidenceRefs?.[0] || "", /^quantora:numeric:study-numeric-verifier-/);
});

test("equivalent velocity units normalize before comparison", () => {
  const result = verify({
    actual: { value: 36, unit: "km/h" },
    expected: { value: 10, unit: "m/s" },
  });
  assert.equal(result.check.status, "verified");
  assert.equal(result.trace?.actual.siValue, 10);
  assert.equal(result.trace?.expected.siValue, 10);
});

test("scientific unit aliases normalize consistently", () => {
  const result = verify({
    actual: { value: 9.81, unit: "m/s²" },
    expected: { value: 9.81, unit: "m/s^2" },
  });
  assert.equal(result.check.status, "verified");
  assert.equal(result.trace?.dimension, "acceleration");
});

test("dimension mismatch is rejected rather than coerced", () => {
  const result = verify({
    actual: { value: 10, unit: "m" },
    expected: { value: 10, unit: "s" },
  });
  assert.equal(result.check.status, "rejected");
  assert.equal(result.check.reasonCode, "numeric_dimension_mismatch");
});

test("unknown unit leaves the claim insufficient", () => {
  const result = verify({
    actual: { value: 10, unit: "furlong/fortnight" },
    expected: { value: 10, unit: "m/s" },
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "numeric_unknown_unit");
  assert.equal(result.trace, null);
});

test("missing physical unit on only one side is insufficient", () => {
  const result = verify({
    actual: { value: 10 },
    expected: { value: 10, unit: "m" },
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "numeric_unit_missing_on_one_side");
});

test("a genuine value mismatch rejects", () => {
  const result = verify({
    actual: { value: 11, unit: "m/s" },
    expected: { value: 10, unit: "m/s" },
  });
  assert.equal(result.check.status, "rejected");
  assert.equal(result.check.reasonCode, "numeric_value_mismatch");
  assert.ok((result.trace?.deltaSi || 0) > (result.trace?.effectiveToleranceSi || 0));
});

test("a small explicit tolerance can verify rounded physical values", () => {
  const result = verify({
    actual: { value: 9.8, unit: "m/s²" },
    expected: { value: 9.81, unit: "m/s²" },
    tolerance: { absolute: 0.02 },
  });
  assert.equal(result.check.status, "verified");
  assert.equal(result.trace?.absoluteToleranceSi, 0.02);
});

test("unsafe broad relative tolerance is refused", () => {
  const result = verify({
    actual: { value: 9, unit: "m" },
    expected: { value: 10, unit: "m" },
    tolerance: { relative: 0.25 },
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "numeric_relative_tolerance_unsafe");
});

test("unsafe broad absolute tolerance is refused", () => {
  const result = verify({
    actual: { value: 9, unit: "m" },
    expected: { value: 10, unit: "m" },
    tolerance: { absolute: 2 },
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "numeric_absolute_tolerance_unsafe");
});

test("admissible bounds reject an out-of-range answer", () => {
  const result = verify({
    actual: { value: -1, unit: "m/s" },
    expected: { value: 1, unit: "m/s" },
    tolerance: { absolute: 0.01 },
    bounds: { min: 0, max: 100, unit: "m/s" },
  });
  assert.equal(result.check.status, "rejected");
  assert.equal(result.check.reasonCode, "numeric_outside_bounds");
});

test("invalid bounds fail safe instead of guessing", () => {
  const result = verify({
    actual: { value: 10, unit: "N" },
    expected: { value: 10, unit: "N" },
    bounds: { min: 20, max: 5, unit: "N" },
  });
  assert.equal(result.check.status, "insufficient");
  assert.equal(result.check.reasonCode, "numeric_bounds_invalid");
});

test("non-finite values never enter verification", () => {
  const nan = verify({ actual: { value: Number.NaN, unit: "m" }, expected: { value: 1, unit: "m" } });
  const infinity = verify({ actual: { value: Number.POSITIVE_INFINITY, unit: "m" }, expected: { value: 1, unit: "m" } });
  assert.equal(nan.check.status, "insufficient");
  assert.equal(infinity.check.status, "insufficient");
  assert.equal(nan.check.reasonCode, "numeric_non_finite_value");
});

test("numeric evidence reference is deterministic and input-sensitive", () => {
  const first = verify();
  const second = verify();
  const changed = verify({ actual: { value: 10.00001, unit: "m/s" }, expected: { value: 10, unit: "m/s" }, tolerance: { absolute: 0.001 } });
  assert.equal(first.check.evidenceRefs?.[0], second.check.evidenceRefs?.[0]);
  assert.notEqual(first.check.evidenceRefs?.[0], changed.check.evidenceRefs?.[0]);
});
