# Study Assessment Corpus — H2

**Status:** H2.3 reviewed corpus expansion in progress  
**Effective from:** 2026-09-02  
**Depends on:** `study-learning-intelligence-architecture.md`, `study-verification-foundation.md`, `study-core-pillar-standardization-roadmap.md`

## Purpose

H2 turns the current small reviewed static bank into a governed corpus that can grow without weakening verified learning.

The sequence is intentionally conservative: establish corpus identity and lifecycle first, enforce quality and coverage gates second, then expand only with independently reviewed content.

## H2.1 corpus record — complete

Every item has a stable `key@version` identity plus server-only metadata for:

- canonical concept and item learning objective;
- curriculum key, curriculum version, official objective and level;
- subject;
- difficulty and cognitive operation;
- evidence purpose;
- representation type;
- prerequisite concept keys;
- provenance and source reference;
- review and release lifecycle.

The lifecycle is explicit:

```text
draft -> in_review -> approved -> released -> retired
             |             |
             +-> rejected <-+
```

A draft cannot move directly to released. A released item must remain an approved reviewed-static item with an auditable review reference. Generated and parametric items remain blocked from verified evidence until their own instance-level verification exists.

## H2.2 quality and release gates — complete

H2.2 adds two separate gates because item correctness and corpus breadth are different claims.

### Item-local release quality

A reviewed-static item cannot issue verified learner evidence unless it also passes deterministic quality checks for:

- a usable prompt;
- bounded option count;
- unique option identifiers;
- unique normalized option text;
- exactly one keyed correct option;
- a substantive explanation rather than an answer-only restatement;
- no explicit answer/correctness markers leaking through the prompt or options.

These checks do not replace independent academic review. They prevent malformed or obviously compromised reviewed content from inheriting verified status merely because its lifecycle metadata says `released`.

### Corpus-wide quality

The corpus audit rejects:

- duplicate `key@version` identities;
- exact duplicate prompts across different items;
- high-similarity prompt clones within the same concept and learning objective.

Near-duplicate detection is deliberately scoped to the same concept/objective. Similar question forms across distinct objectives are not automatically treated as defects.

### H2.2 pilot coverage floor

The current released bank contains ten items across nine governed concepts. H2.2 requires at least one quality-passing released item for every governed concept, plus representation of diagnostic, retrieval, application and misconception-probe purposes and the three mapped 2026 pilot curricula.

That remains the active runtime floor while H2.3 candidates are under review.

## H2.3 reviewed expansion — in progress

H2.3 targets a deliberate next floor of **two independently reviewed, quality-passing released items per governed concept** before H2.4 diagnostic breadth begins.

Eight additional items are staged as explicit `in_review` candidates for the eight concepts that currently have only one released item. Motion graphs already has two distinct reviewed items and therefore does not receive an artificial third item merely to increase count.

The candidate set covers distinct objectives including:

- trigonometric signs in a different quadrant;
- Pythagorean-identity application to recover a missing ratio;
- speed-versus-velocity distinction;
- collinear opposite vector resultants;
- vertical vector components;
- constant-velocity versus acceleration misconception detection;
- horizontal-launch component accelerations;
- projectile velocity components at the highest point.

### Truth boundary

The eight new questions are **not released** and **do not count as verified corpus coverage yet**.

They carry:

- `reviewStatus: draft`;
- corpus lifecycle `in_review`;
- no fabricated `reviewRef`;
- the same deterministic item-quality checks as released items;
- an explicit governance test proving they cannot issue verified attempts before review.

The stronger H2.3 two-item coverage policy is defined and tested prospectively, but runtime release readiness continues to enforce the H2.2 floor until independent review evidence exists for the candidates.

Only after independent review may a candidate transition from `in_review -> approved -> released`, receive an auditable review reference, join the production item bank, and count toward the H2.3 coverage floor.

H2.3 still does **not** claim syllabus completeness, examination readiness or broad diagnostic coverage. It strengthens the current governed slice; H2.4 will decide how to widen trustworthy diagnostic breadth.

## Current truth

Production still contains ten released reviewed-static items across nine canonical concepts. Eight additional H2.3 candidates are staged for independent review and are deliberately outside production selection and verified evidence issuance.

The corpus metadata remains server-only. Learners receive the prompt, options, response format and stable public identity—not answer keys, explanations, misconception mappings, governance state, curriculum internals or provenance records.

## Sequence

1. **H2.1 — Corpus architecture: COMPLETE.** Record schema, lifecycle, provenance and curriculum mappings.
2. **H2.2 — Quality and release gates: COMPLETE.** Item-local quality plus corpus duplicate and explicit pilot coverage gates.
3. **H2.3 — Reviewed expansion: IN PROGRESS.** Stage eight quality-passing candidates, complete independent review, promote only approved items, then activate the two-item-per-concept runtime floor.
4. **H2.4 — Diagnostic breadth:** use the expanded released corpus for trustworthy multi-concept diagnostics and prerequisite-gap routing.

No H2 phase may auto-promote model-generated content into verified learner evidence.
