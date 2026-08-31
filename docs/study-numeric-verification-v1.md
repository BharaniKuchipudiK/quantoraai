# Quantora Study — Numeric Verification V1

**Status:** Implementation slice  
**Depends on:** verified-learning foundation merged via PR #395  
**Scope:** deterministic numeric verification only

## Purpose

Numeric claims in Study must not be accepted because an LLM says they look right. V1 provides a small deterministic verifier that can be invoked by the shared Study verification runtime.

The contract remains:

> Generative AI may propose. Quantora verifies. Learner evidence decides what happens next.

## What V1 verifies

- finite numeric values only
- unit compatibility before comparison
- deterministic conversion to a canonical SI value
- exact/near-exact comparison under a bounded tolerance policy
- optional admissible min/max bounds
- auditable deterministic verification traces

Supported unit families in V1:

- dimensionless
- length: m, cm, mm, km
- time: s, ms, min, h
- mass: kg, g
- velocity: m/s, km/h
- acceleration: m/s²
- force: N, kN
- energy: J, kJ
- pressure: Pa, kPa
- angle: rad, deg

Unknown units fail **insufficient** rather than being guessed or coerced.

## Decision semantics

### Verified

The quantities have compatible dimensions, normalize successfully, satisfy optional bounds, and differ by no more than the effective tolerance.

### Rejected

The verifier has enough deterministic information to show the claim is wrong, for example:

- incompatible physical dimensions
- candidate outside a valid admissible range
- value mismatch beyond the allowed tolerance

### Insufficient

The verifier does not have a safe basis to decide, for example:

- unknown or missing physical unit
- NaN / Infinity
- invalid bounds
- unsafe tolerance policy
- normalization overflow

`insufficient` is intentional. It is safer than converting an unsupported representation into false certainty.

## Tolerance policy

Defaults are deliberately strict:

- relative: `1e-9`
- absolute SI floor: `1e-12`

A caller may request a looser tolerance when the educational problem explicitly requires rounding or measured values, but V1 refuses:

- relative tolerance above 5%
- absolute tolerance above a conservative 5%-of-expected safety ceiling (with a tiny unit-scale floor around zero)

This prevents a caller from making a wrong answer become "verified" by silently supplying a huge tolerance.

## Evidence trace

Each completed deterministic comparison produces a normalized trace containing:

- claim ID
- dimension
- actual and expected input values/units
- canonical SI values
- delta
- effective tolerance
- normalized bounds
- decision and reason code

The trace is hashed into a stable evidence reference:

`quantora:numeric:<verifier-version>:<digest>`

V1 returns the trace to its caller; persistence/ledger storage is intentionally deferred until the numeric verifier is connected to a learner-evidence-producing workflow.

## Shared runtime

`study-verification-runtime.ts` is the bridge between a verification plan and concrete verifier implementations.

- Numeric requirements call the deterministic numeric verifier.
- Reviewed-assessment requirements use the already-merged governed assessment path.
- Symbolic, formal and grounded-source requirements remain `insufficient` until their implementations land.

The existing Study assessment issuance path now uses this runtime for its reviewed-assessment verification, keeping the runtime reachable in production without changing assessment behavior.

## Explicitly out of scope

- symbolic algebra / SymPy
- formal theorem proving / Lean
- free-form equation parsing
- OCR / handwriting recognition
- LLM-as-judge correctness
- learner-state writes
- new database tables or migrations
- Study UI changes
- model/provider routing changes

## Next slice

V2 should add symbolic verification behind the same runtime, with explicit assumptions/domains and a rule that heuristic simplification is not automatically treated as formal proof.
