# Quantora Outcome Runtime

Status: Phase 1 foundation

## Product thesis

**Models answer. Quantora finishes.**

Quantora's differentiating runtime is the combination of:

1. **PCL Cognitive Kernel** — continuity, judgment, human governance and action authorization.
2. **Outcome Contract** — a living, provider-neutral contract for the mission and its Definition of Done.
3. **Proof of Done** — deterministic completion evidence that prevents a model from self-declaring success without support.
4. **Cognitive Ledger** — durable decisions, rejections, corrections, approvals, evidence and outcome transitions.

Together these form the first version of the **Quantora Outcome Runtime**.

## Outcome Contract

The Outcome Contract is projected from the existing trusted conversation/project state. It is **not another database or memory store**.

It contains:

- mission statement and status;
- Definition of Done / success criteria;
- confirmed and inferred context;
- project constraints and decisions;
- produced deliverables and verification state;
- material open questions and safety flags;
- active rejections and corrections;
- next actions;
- measurable progress.

Every provider receives a compact contract through the existing PCL Navigator seam. The model should work toward the mission rather than optimizing only for the latest sentence.

## Proof of Done

Quantora must not use "Done" as a conversational flourish.

A verified outcome requires the applicable checks to pass:

- mission exists;
- Definition of Done exists;
- every required success criterion is confirmed;
- material questions are resolved;
- unresolved safety flags are clear;
- produced artifacts are verified;
- completion evidence is attached when artifacts exist;
- the mission is explicitly marked achieved.

Possible Proof-of-Done states:

- `not_ready` — outcome is still in progress;
- `verification_required` — work appears complete but verification/closure is incomplete;
- `blocked` — material ambiguity or safety issue prevents completion;
- `verified` — the mission, success criteria and evidence support a Done claim.

## Golden Workflow #1

The first opt-in Golden Outcome Blueprint is **Executive Cloud Migration Strategy**.

Its mission is to produce a decision-ready cloud migration strategy and executive business case spanning:

- current-state drivers;
- recommended migration approach and rationale;
- target-state architecture;
- phased roadmap;
- business case and major assumptions;
- material risks;
- executive presentation;
- cross-artifact consistency verification.

The blueprint instantiates ordinary canonical Outcome State. It does not introduce a private workflow engine or bypass PCL.

## Architecture rule

**One mission state. One PCL. Many replaceable models and tools.**

Outcome Runtime features must remain provider-neutral and must not create hidden completion state outside Outcome State / Project Outcome Graph / Cognitive Ledger.
