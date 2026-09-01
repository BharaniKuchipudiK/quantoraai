# Study Assessment Corpus — H2

**Status:** H2.2 quality and release gates in progress  
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

## H2.2 quality and release gates

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

### Explicit pilot coverage floor

Coverage is policy, not inference. The current H2 pilot policy requires at least one quality-passing released item for each of the nine currently governed canonical concepts, plus released representation of the current diagnostic, retrieval, application and misconception-probe purposes and the three mapped 2026 pilot curricula.

This is a **non-regression floor for the current pilot**, not a claim of syllabus completeness, examination readiness or sufficient diagnostic breadth. H2.3 must raise these thresholds as reviewed content expands.

## Current truth

The existing bank contains ten released items across nine canonical concepts. H2.1 records that baseline and H2.2 protects it from malformed items, duplicate drift and accidental loss of the current mapped coverage floor.

The corpus metadata remains server-only. Learners receive the prompt, options, response format and stable public identity—not answer keys, explanations, misconception mappings, governance state, curriculum internals or provenance records.

## Sequence

1. **H2.1 — Corpus architecture: COMPLETE.** Record schema, lifecycle, provenance and curriculum mappings.
2. **H2.2 — Quality and release gates: IN PROGRESS.** Item-local answer/explanation/ambiguity/leakage checks plus corpus duplicate and explicit pilot coverage gates.
3. **H2.3 — Reviewed expansion:** add independently reviewed items by curriculum priority and evidence purpose; raise coverage thresholds deliberately.
4. **H2.4 — Diagnostic breadth:** use the expanded corpus for trustworthy multi-concept diagnostics and prerequisite-gap routing.

No H2 phase may auto-promote model-generated content into verified learner evidence.
