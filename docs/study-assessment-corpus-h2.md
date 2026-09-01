# Study Assessment Corpus — H2

**Status:** H2.1 architecture in progress  
**Effective from:** 2026-09-02  
**Depends on:** `study-learning-intelligence-architecture.md`, `study-verification-foundation.md`, `study-core-pillar-standardization-roadmap.md`

## Purpose

H2 turns the current small reviewed static bank into a governed corpus that can grow without weakening verified learning.

The first step is not bulk question generation. H2.1 establishes the record and lifecycle contract every current and future item must satisfy.

## H2.1 corpus record

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

## Current truth

The existing bank contains ten released items across nine canonical concepts. H2.1 records that baseline; it does not claim broad curriculum coverage or exam readiness.

The corpus metadata remains server-only. Learners receive the prompt, options, response format and stable public identity—not answer keys, explanations, misconception mappings, governance state, curriculum internals or provenance records.

## Sequence

1. **H2.1 — Corpus architecture:** record schema, lifecycle, provenance and curriculum mappings.
2. **H2.2 — Quality and release gates:** duplicate/near-duplicate detection, answer and explanation checks, ambiguity/leakage rules, and explicit coverage thresholds.
3. **H2.3 — Reviewed expansion:** add independently reviewed items by curriculum priority and evidence purpose.
4. **H2.4 — Diagnostic breadth:** use the expanded corpus for trustworthy multi-concept diagnostics and prerequisite-gap routing.

No H2 phase may auto-promote model-generated content into verified learner evidence.
