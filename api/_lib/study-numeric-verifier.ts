import { createHash } from "node:crypto";
import type { StudyVerificationCheck } from "./study-verification.js";

export const STUDY_NUMERIC_VERIFIER_VERSION = "study-numeric-verifier-2026-08-31.1";

export type StudyNumericQuantity = {
  value: number;
  unit?: string | null;
};

export type StudyNumericTolerance = {
  /** Absolute tolerance expressed in the expected quantity's unit. */
  absolute?: number | null;
  /** Relative tolerance as a fraction, e.g. 0.01 = 1%. */
  relative?: number | null;
};

export type StudyNumericBounds = {
  min?: number | null;
  max?: number | null;
  /** Defaults to the expected quantity's unit. */
  unit?: string | null;
};

export type StudyNumericVerificationRequest = {
  claimId: string;
  actual: StudyNumericQuantity;
  expected: StudyNumericQuantity;
  tolerance?: StudyNumericTolerance | null;
  bounds?: StudyNumericBounds | null;
};

export type StudyNumericVerificationTrace = {
  version: string;
  claimId: string;
  dimension: string;
  actual: { inputValue: number; inputUnit: string; siValue: number };
  expected: { inputValue: number; inputUnit: string; siValue: number };
  deltaSi: number;
  effectiveToleranceSi: number;
  relativeTolerance: number;
  absoluteToleranceSi: number;
  boundsSi: { min: number | null; max: number | null };
  decision: "verified" | "rejected";
  reasonCode: string;
};

export type StudyNumericVerificationResult = {
  check: StudyVerificationCheck;
  trace: StudyNumericVerificationTrace | null;
};

type UnitSpec = {
  canonical: string;
  dimension: string;
  scaleToSi: number;
};

const UNIT_SPECS: Record<string, UnitSpec> = {
  "": { canonical: "1", dimension: "dimensionless", scaleToSi: 1 },
  "1": { canonical: "1", dimension: "dimensionless", scaleToSi: 1 },
  "unitless": { canonical: "1", dimension: "dimensionless", scaleToSi: 1 },
  "dimensionless": { canonical: "1", dimension: "dimensionless", scaleToSi: 1 },

  "m": { canonical: "m", dimension: "length", scaleToSi: 1 },
  "cm": { canonical: "cm", dimension: "length", scaleToSi: 0.01 },
  "mm": { canonical: "mm", dimension: "length", scaleToSi: 0.001 },
  "km": { canonical: "km", dimension: "length", scaleToSi: 1000 },

  "s": { canonical: "s", dimension: "time", scaleToSi: 1 },
  "ms": { canonical: "ms", dimension: "time", scaleToSi: 0.001 },
  "min": { canonical: "min", dimension: "time", scaleToSi: 60 },
  "h": { canonical: "h", dimension: "time", scaleToSi: 3600 },
  "hr": { canonical: "h", dimension: "time", scaleToSi: 3600 },

  "kg": { canonical: "kg", dimension: "mass", scaleToSi: 1 },
  "g": { canonical: "g", dimension: "mass", scaleToSi: 0.001 },

  "m/s": { canonical: "m/s", dimension: "velocity", scaleToSi: 1 },
  "km/h": { canonical: "km/h", dimension: "velocity", scaleToSi: 1000 / 3600 },
  "km/hr": { canonical: "km/h", dimension: "velocity", scaleToSi: 1000 / 3600 },

  "m/s^2": { canonical: "m/s^2", dimension: "acceleration", scaleToSi: 1 },
  "m/s2": { canonical: "m/s^2", dimension: "acceleration", scaleToSi: 1 },

  "n": { canonical: "N", dimension: "force", scaleToSi: 1 },
  "kn": { canonical: "kN", dimension: "force", scaleToSi: 1000 },

  "j": { canonical: "J", dimension: "energy", scaleToSi: 1 },
  "kj": { canonical: "kJ", dimension: "energy", scaleToSi: 1000 },

  "pa": { canonical: "Pa", dimension: "pressure", scaleToSi: 1 },
  "kpa": { canonical: "kPa", dimension: "pressure", scaleToSi: 1000 },

  "rad": { canonical: "rad", dimension: "angle", scaleToSi: 1 },
  "deg": { canonical: "deg", dimension: "angle", scaleToSi: Math.PI / 180 },
  "degree": { canonical: "deg", dimension: "angle", scaleToSi: Math.PI / 180 },
  "degrees": { canonical: "deg", dimension: "angle", scaleToSi: Math.PI / 180 },
};

const DEFAULT_RELATIVE_TOLERANCE = 1e-9;
const DEFAULT_ABSOLUTE_TOLERANCE_SI = 1e-12;
const MAX_RELATIVE_TOLERANCE = 0.05;
const ABSOLUTE_TOLERANCE_FLOOR_FACTOR = 1e-6;

function cleanClaimId(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 200) : "";
}

function unitKey(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/²/g, "^2")
    .replace(/\s+/g, "");
}

function unitSpec(value: unknown): UnitSpec | null {
  return UNIT_SPECS[unitKey(value)] || null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function insufficient(reasonCode: string): StudyNumericVerificationResult {
  return {
    check: {
      verifier: "numeric",
      status: "insufficient",
      evidenceRefs: [],
      reasonCode,
    },
    trace: null,
  };
}

function canonicalTrace(trace: StudyNumericVerificationTrace): string {
  const ordered = {
    version: trace.version,
    claimId: trace.claimId,
    dimension: trace.dimension,
    actual: trace.actual,
    expected: trace.expected,
    deltaSi: trace.deltaSi,
    effectiveToleranceSi: trace.effectiveToleranceSi,
    relativeTolerance: trace.relativeTolerance,
    absoluteToleranceSi: trace.absoluteToleranceSi,
    boundsSi: trace.boundsSi,
    decision: trace.decision,
    reasonCode: trace.reasonCode,
  };
  return JSON.stringify(ordered);
}

function traceEvidenceRef(trace: StudyNumericVerificationTrace): string {
  const digest = createHash("sha256").update(canonicalTrace(trace)).digest("hex").slice(0, 24);
  return `quantora:numeric:${STUDY_NUMERIC_VERIFIER_VERSION}:${digest}`;
}

function buildResult(
  input: {
    claimId: string;
    dimension: string;
    actualValue: number;
    actualUnit: UnitSpec;
    expectedValue: number;
    expectedUnit: UnitSpec;
    deltaSi: number;
    effectiveToleranceSi: number;
    relativeTolerance: number;
    absoluteToleranceSi: number;
    boundsSi: { min: number | null; max: number | null };
  },
  decision: "verified" | "rejected",
  reasonCode: string,
): StudyNumericVerificationResult {
  const trace: StudyNumericVerificationTrace = {
    version: STUDY_NUMERIC_VERIFIER_VERSION,
    claimId: input.claimId,
    dimension: input.dimension,
    actual: {
      inputValue: input.actualValue,
      inputUnit: input.actualUnit.canonical,
      siValue: input.actualValue * input.actualUnit.scaleToSi,
    },
    expected: {
      inputValue: input.expectedValue,
      inputUnit: input.expectedUnit.canonical,
      siValue: input.expectedValue * input.expectedUnit.scaleToSi,
    },
    deltaSi: input.deltaSi,
    effectiveToleranceSi: input.effectiveToleranceSi,
    relativeTolerance: input.relativeTolerance,
    absoluteToleranceSi: input.absoluteToleranceSi,
    boundsSi: input.boundsSi,
    decision,
    reasonCode,
  };
  return {
    check: {
      verifier: "numeric",
      status: decision,
      evidenceRefs: [traceEvidenceRef(trace)],
      reasonCode,
    },
    trace,
  };
}

/**
 * Deterministically verifies one numeric Study claim.
 *
 * The function performs no model call and no symbolic reasoning. It only
 * compares finite quantities after unit normalization, validates tolerance
 * policy, checks optional admissible bounds, and emits a reproducible trace.
 */
export function verifyStudyNumericClaim(
  request: StudyNumericVerificationRequest,
): StudyNumericVerificationResult {
  const claimId = cleanClaimId(request?.claimId);
  if (!claimId) return insufficient("numeric_invalid_claim_id");
  if (!finite(request?.actual?.value) || !finite(request?.expected?.value)) {
    return insufficient("numeric_non_finite_value");
  }

  const actualUnit = unitSpec(request?.actual?.unit);
  const expectedUnit = unitSpec(request?.expected?.unit);
  if (!actualUnit || !expectedUnit) return insufficient("numeric_unknown_unit");

  const actualHasUnit = unitKey(request?.actual?.unit) !== "";
  const expectedHasUnit = unitKey(request?.expected?.unit) !== "";
  if (actualHasUnit !== expectedHasUnit) return insufficient("numeric_unit_missing_on_one_side");
  if (actualUnit.dimension !== expectedUnit.dimension) {
    const actualSi = request.actual.value * actualUnit.scaleToSi;
    const expectedSi = request.expected.value * expectedUnit.scaleToSi;
    return buildResult({
      claimId,
      dimension: `${actualUnit.dimension}->${expectedUnit.dimension}`,
      actualValue: request.actual.value,
      actualUnit,
      expectedValue: request.expected.value,
      expectedUnit,
      deltaSi: Math.abs(actualSi - expectedSi),
      effectiveToleranceSi: 0,
      relativeTolerance: 0,
      absoluteToleranceSi: 0,
      boundsSi: { min: null, max: null },
    }, "rejected", "numeric_dimension_mismatch");
  }

  const expectedSi = request.expected.value * expectedUnit.scaleToSi;
  const actualSi = request.actual.value * actualUnit.scaleToSi;
  if (!Number.isFinite(expectedSi) || !Number.isFinite(actualSi)) {
    return insufficient("numeric_normalization_overflow");
  }

  const requestedRelative = request?.tolerance?.relative;
  const relativeTolerance = requestedRelative == null ? DEFAULT_RELATIVE_TOLERANCE : requestedRelative;
  if (!finite(relativeTolerance) || relativeTolerance < 0 || relativeTolerance > MAX_RELATIVE_TOLERANCE) {
    return insufficient("numeric_relative_tolerance_unsafe");
  }

  const requestedAbsolute = request?.tolerance?.absolute;
  let absoluteToleranceSi = DEFAULT_ABSOLUTE_TOLERANCE_SI;
  if (requestedAbsolute != null) {
    if (!finite(requestedAbsolute) || requestedAbsolute < 0) {
      return insufficient("numeric_absolute_tolerance_invalid");
    }
    absoluteToleranceSi = requestedAbsolute * expectedUnit.scaleToSi;
    const maxAllowedAbsoluteSi = Math.max(
      Math.abs(expectedSi) * MAX_RELATIVE_TOLERANCE,
      expectedUnit.scaleToSi * ABSOLUTE_TOLERANCE_FLOOR_FACTOR,
    );
    if (!Number.isFinite(absoluteToleranceSi) || absoluteToleranceSi > maxAllowedAbsoluteSi) {
      return insufficient("numeric_absolute_tolerance_unsafe");
    }
  }

  const boundsUnit = request?.bounds?.unit == null ? expectedUnit : unitSpec(request.bounds.unit);
  if (request?.bounds && !boundsUnit) return insufficient("numeric_bounds_unknown_unit");
  if (request?.bounds && boundsUnit && boundsUnit.dimension !== expectedUnit.dimension) {
    return insufficient("numeric_bounds_dimension_mismatch");
  }

  const minRaw = request?.bounds?.min;
  const maxRaw = request?.bounds?.max;
  if (minRaw != null && !finite(minRaw)) return insufficient("numeric_bounds_non_finite");
  if (maxRaw != null && !finite(maxRaw)) return insufficient("numeric_bounds_non_finite");

  const minSi = minRaw == null ? null : minRaw * (boundsUnit?.scaleToSi ?? expectedUnit.scaleToSi);
  const maxSi = maxRaw == null ? null : maxRaw * (boundsUnit?.scaleToSi ?? expectedUnit.scaleToSi);
  if ((minSi != null && !Number.isFinite(minSi)) || (maxSi != null && !Number.isFinite(maxSi))) {
    return insufficient("numeric_bounds_normalization_overflow");
  }
  if (minSi != null && maxSi != null && minSi > maxSi) return insufficient("numeric_bounds_invalid");
  if ((minSi != null && expectedSi < minSi) || (maxSi != null && expectedSi > maxSi)) {
    return insufficient("numeric_expected_outside_bounds");
  }

  const deltaSi = Math.abs(actualSi - expectedSi);
  const effectiveToleranceSi = Math.max(
    absoluteToleranceSi,
    Math.abs(expectedSi) * relativeTolerance,
  );
  const common = {
    claimId,
    dimension: expectedUnit.dimension,
    actualValue: request.actual.value,
    actualUnit,
    expectedValue: request.expected.value,
    expectedUnit,
    deltaSi,
    effectiveToleranceSi,
    relativeTolerance,
    absoluteToleranceSi,
    boundsSi: { min: minSi, max: maxSi },
  };

  if ((minSi != null && actualSi < minSi) || (maxSi != null && actualSi > maxSi)) {
    return buildResult(common, "rejected", "numeric_outside_bounds");
  }
  if (deltaSi > effectiveToleranceSi) {
    return buildResult(common, "rejected", "numeric_value_mismatch");
  }
  return buildResult(common, "verified", "numeric_within_tolerance");
}
