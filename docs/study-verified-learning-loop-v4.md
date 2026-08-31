# Quantora Study — Verified Learning Loop V4

**Status:** implementation contract  
**Effective:** 2026-08-31  
**Scope:** Study backend trust/adaptation path only. No Study UI, Studio-entry dependency, provider routing, or new learner-state store.

## Purpose

V4 connects the existing reviewed assessment path to the existing learner model without allowing event shape to become a trust shortcut.

The loop is:

**Issue governed item → grade server-side → append evidence atomically → admit evidence → estimate mastery → project learner state → choose next learning move**

Quantora continues to have exactly one learner truth: the learner model is a projection over admitted evidence, not a second mutable source of mastery.

## Core invariants

1. **Event kind is not proof.** An event named `assessment_item`, `application`, `retrieval`, or similar does not influence mastery unless it passes the central evidence-admission policy.
2. **Mastery and learner state consume the same evidence set.** There is one chronological, deduplicated admission function used by both.
3. **Reviewed assessment evidence requires the full server provenance chain.** V4 requires Quantora-authored provenance, the canonical assessment-bank source, a valid server attempt reference, a versioned item reference, an independent observation, a valid timestamp, and a score/correctness signal.
4. **Repeated item versions cannot manufacture progress.** Only the first independent observation of a reviewed assessment item/version is admitted. Later repeats may still be useful conversationally, but they do not create fresh independent mastery evidence.
5. **Future evidence families fail closed.** Retrieval, application, transfer, teach-back, retention and misconception probes require a governed verified-source receipt before admission. V4 does not grant them trust merely because the event kind exists.
6. **Self-confidence remains context, never mastery proof.**
7. **Generated/parametric assessment families are not silently upgraded.** An approved family label is insufficient; instance-level verification must exist before those families can issue verified attempts.
8. **False mastery is a severe defect.** Missing provenance or verification results in no mastery contribution rather than optimistic inference.

## Existing atomic boundary

`complete_study_assessment_attempt` remains the production atomic boundary for reviewed assessment grading and evidence insertion. V4 does not split this into multiple browser/server writes.

The handler then reads the ledger, estimates mastery and builds the learner model from the centrally admitted evidence set.

## V4 release coverage

The protected Study assessment suite must prove:

- assessment governance blocks draft/rejected/generated/parametric items from verified issuance;
- grading/governance metadata never leaks in the public item payload;
- assessment-shaped rows without reviewed provenance cannot influence mastery;
- a wrong misconception answer produces admitted evidence and selects `diagnose_misconception`;
- re-grading the same attempt does not append evidence;
- a fresh attempt of the same item/version is not fresh independent mastery evidence;
- mastery and learner-state evidence counts remain identical.

## Payload budget rule

The Studio entry chunk has a hard **300,000 byte ceiling**. The number is never raised to accommodate Study.

V4 is server-side and test/documentation only. It must add **zero surface-specific code to the Studio entry path**. Future Study UI for learner graphs, diagnostics, evidence views or assessment controls must live behind Study-owned lazy/dynamic boundaries.

> Surface-specific code follows the surface. When payload pressure rises, move the dependency; never raise the ceiling.

## Next phase

After V4 is certified and production-gated, the next learning-intelligence phase is **Misconception Intelligence**: classify why an admitted learner attempt failed and choose the smallest targeted remediation without creating a second learner truth model.
