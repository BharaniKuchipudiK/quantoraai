# Quantora Study — Verification Foundation

**Status:** Foundation contract  
**Effective:** 2026-08-31  
**Scope:** Study backend trust contract only. No live tutor routing or learner-state behavior changes in this PR.

## Product rule

> **Generative AI may propose. Quantora must verify before it claims verified truth. Learner evidence decides what happens next.**

This contract exists to prevent Study from treating fluent model output as mathematical truth, curriculum truth, or verified assessment evidence.

It complements the existing one-learner-truth architecture. It does not create a second learner model, a second orchestrator, or a parallel Study state store.

## Verification is routed by claim type

Quantora does **not** force every Study claim through one proof technology.

| Claim type | Required verifier | Typical future implementation |
| --- | --- | --- |
| Numeric result | Numeric | deterministic arithmetic / units / bounds |
| Symbolic equivalence | Symbolic | SymPy-style symbolic checking |
| Formal proof | Formal, only when formalizable | Lean-style proof checking for selected classes |
| Curriculum fact | Grounded source | canonical curriculum/source retrieval |
| Assessment key | Reviewed assessment | governed item/version/review record |

Formal proof is deliberately narrow. Lean or another proof assistant is not a universal verifier for Physics, Chemistry, Biology, diagrams, prose explanations, or every JEE/NEET response.

## Two source policies

### Exam Grounded mode

Curriculum facts must be supported by an allowed canonical source class:

- official
- open licensed
- Quantora reviewed

A general web page is not sufficient to establish exam truth.

### Explore mode

Cited web or connected sources may support a factual claim, but the claim must still pass the grounded-source verifier before being labelled verified.

## Non-negotiable invariants

1. A required verifier rejection rejects the claim.
2. Missing or inconclusive required checks produce **insufficient**, never a guessed success.
3. A verifier cannot return trusted success without an auditable evidence reference.
4. Optional checks may strengthen evidence; they can never rescue a failed required check.
5. Unreviewed assessment answer keys cannot become verified learner evidence.
6. A formal-proof claim is not routed to a proof assistant until it is explicitly formalizable.
7. The verification layer does not mutate mastery or learner truth directly.
8. Verification provenance must remain traceable as implementations are added.

## Why this PR is intentionally small

The existing Study code already has:

- a server-side learner truth model
- evidence-backed understanding and misconception state
- assessment governance
- deterministic next-learning-move selection
- a conversation-first Study surface

The safest next step is therefore a pure, tested verification contract before wiring symbolic engines, source retrieval, or formal proof tooling into production paths.

## Follow-on PR sequence

### V1 — Numeric verifier

- exact arithmetic and deterministic numeric traces
- physical units / dimensional checks where applicable
- safe tolerance policy
- no learner-state writes

### V2 — Symbolic verifier

- symbolic expression/equation equivalence
- explicit assumptions and domains
- deterministic trace references
- reject heuristic simplification as proof when it is not proof

### V3 — Grounded curriculum verifier

- canonical-source resolver
- Exam Grounded source allow-list
- citations/provenance in verifier evidence
- no open-web answer key creation

### V4 — Assessment integration

- connect governed assessment item versions to `reviewed_assessment`
- prevent draft/generated answer keys from contributing verified mastery
- add the full issue → answer → verify → evidence → learner-model integration test

### V5 — Formal verifier pilot

- only for selected mathematical proof classes where formalization is practical
- prove measured educational value before wider use
- do not make formal proof a dependency for ordinary Study tutoring

## Explicitly out of scope for this foundation PR

- SymPy dependency
- Lean dependency or proof server
- Mathpix or any OCR vendor lock-in
- MCTS tutoring policy
- reinforcement learning infrastructure
- database migration
- provider/model routing change
- UI change
- Production deployment
- automatic learner-state mutation

The goal of this PR is to make later verification implementations plug into one conservative contract instead of inventing trust semantics independently in each Study feature.
