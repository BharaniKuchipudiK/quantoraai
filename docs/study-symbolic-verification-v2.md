# Quantora Study — Symbolic Verification V2

**Status:** Implementation slice  
**Scope:** Exact symbolic algebra behind the existing Study verification runtime.

## Product rule

Symbolic correctness is not delegated to an LLM and heuristic simplification is not treated as proof.

V2 verifies only a deliberately restricted algebraic subset where Quantora can produce an exact deterministic result. Anything outside that subset returns `insufficient` and can be routed to a future verifier rather than guessed.

## Supported in V2

- multivariate polynomial expressions
- rational expressions
- `+`, `-`, `*`, `/`
- parentheses
- integer powers from `0` through `8`
- exact integer and decimal constants
- expression equivalence by exact rational cross-multiplication
- equation equivalence by exact zero-set normalization up to a non-zero scalar multiple
- explicit `real` or `complex` domain
- explicit declared variables
- explicit non-zero assumptions when cancellation would otherwise change the expression domain

Examples that may verify:

- `(x + 1)^2` vs `x^2 + 2*x + 1`
- `x/2 + x/2` vs `x`
- `2*x + 2 = 4` vs `x + 1 = 2`
- `x/x` vs `1` only when `x != 0` is supplied as an explicit non-zero assumption

## Conservative boundaries

V2 does **not** claim support for:

- trigonometric functions
- logarithms or exponentials
- roots / radicals
- symbolic or fractional exponents
- inequalities
- implicit multiplication
- piecewise functions
- complex branch-cut reasoning
- theorem proving
- calculus identities

These return `insufficient`, not a heuristic answer.

## Domain preservation

Algebraic cancellation can silently change a function's domain. For example:

`x/x = 1`

is true only where `x != 0`.

The verifier therefore records denominator constraints. If the two candidate expressions do not carry the same constraints, verification requires an explicit matching non-zero assumption. This prevents simplification from widening the valid domain without evidence.

## Exact arithmetic

Numeric constants are parsed into normalized rational numbers using `bigint` numerator/denominator pairs. Symbolic equality therefore does not depend on floating-point sampling or random test points.

## Runtime integration

`study-verification-runtime.ts` now has concrete implementations for:

1. Numeric verification — V1
2. Symbolic verification — V2
3. Reviewed assessment verification

Formal proof and grounded curriculum verification remain `insufficient` until their own implementation slices land.

## Security / reliability guards

- expression length limit
- token-count limit
- variable-count limit
- exponent limit
- polynomial term-count limit
- unsupported tokens fail closed
- undeclared variables fail closed
- impossible domain assumptions fail closed
- no model calls
- no external symbolic service dependency
- no learner-state mutation

## Why this does not add SymPy yet

The immediate requirement is a deterministic, auditable verifier with a small attack surface and no new service/dependency boundary. This V2 slice proves the verification contract and covers a useful exact algebra core in-process.

A future CAS-backed verifier may broaden coverage, but it must remain behind the same trust contract and must distinguish exact proof/equivalence from heuristic simplification.

## Next slice

Canonical Curriculum Grounding V3:

- authoritative source classes
- exam-grounded allow-list policy
- source/version provenance
- verified factual claims only when grounding evidence is available
- no open-web answer-key creation in Exam Grounded mode
