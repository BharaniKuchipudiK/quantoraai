# Study H2.4 — Diagnostic Breadth

**Status:** implementation in progress  
**Effective from:** 2026-09-02  
**Depends on:** the released H2.2 assessment corpus, learner graph evidence, canonical prerequisite graph  
**Does not depend on:** parked H2.3 candidate approval

## Purpose

H2.4 turns the existing one-concept evidence and prerequisite recovery logic into a bounded multi-concept diagnostic decision layer.

The diagnostic is not a quiz score generator. Its job is to answer:

> Which governed concept check will reduce the most useful uncertainty next, and when should Quantora stop testing?

## Runtime contract

The H2.4 planner accepts a bounded set of evidence-backed concept candidates and selects at most one next diagnostic check.

Selection order is deterministic:

1. specific evidence-backed misconception diagnosis;
2. confirmation of a suspected misconception;
3. verified failure requiring guided repair;
4. missing or weak independent evidence;
5. need for a different governed evidence form.

Within the same diagnostic need, the planner prefers:

- the more uncertain learner state;
- the deeper unresolved prerequisite blocker;
- the stronger canonical prerequisite edge;
- canonical-key ordering as the final deterministic tie-break.

The numeric ordering used internally is not a mastery probability and must never be exposed as one.

## Stop rules

The short diagnostic stops when:

- its bounded check budget is exhausted;
- no diagnostic-relevant candidate remains in the available governed scope;
- remaining next moves are retention or transfer work rather than diagnosis.

The initial default budget is five checks, with a hard defensive cap of twelve even if a caller supplies a larger number.

A concept already checked in the current short diagnostic is not selected again.

## Prerequisite routing

The existing prerequisite traversal remains responsible for reading the canonical graph and admitted evidence. H2.4 replaces the local candidate-sort heuristic with the reusable diagnostic breadth planner.

This preserves the existing safeguards:

- graph edges below the confidence threshold are ignored;
- traversal depth and inspected concept count remain bounded;
- converging prerequisite branches reuse cached concept/evidence reads;
- unavailable graph/evidence state fails closed;
- conversational fluency never becomes verified learner truth.

## H2.3 boundary

H2.3 independent academic review is parked. H2.4 therefore operates only on currently released governed content and existing admitted evidence.

Retention probes and governed transfer tasks are represented in the wider learning architecture, but H2.4 deliberately does not pull them into the short diagnostic while their reviewed corpus expansion remains outstanding.

## Exit criteria

H2.4 is complete only when all of the following are true:

- multi-concept candidate choice is deterministic and runtime-wired;
- prerequisite-gap routing uses the same planner;
- repeat avoidance and bounded stop rules are tested;
- retention/transfer separation is tested;
- no new learner-truth source is introduced;
- repository typecheck, tests, wiring/orphan audit, browser release gates and deployed release checks are green on the exact PR head.

This phase does not claim syllabus completeness or broad exam readiness. Diagnostic breadth is constrained by the reviewed corpus actually available at runtime.
