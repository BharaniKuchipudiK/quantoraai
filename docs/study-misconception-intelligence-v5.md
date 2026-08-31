# Quantora Study — Misconception Intelligence V5

**Status:** implementation contract  
**Effective:** 2026-08-31  
**Scope:** Study backend learner-intelligence path only. No Study UI, Studio-entry dependency, provider routing, or new learner-state store.

## Purpose

V5 answers a narrower and more useful question than "was the learner wrong?":

**Which reviewed misconception best explains this verified wrong answer, and what is the smallest corrective intervention?**

The loop is:

**Issue reviewed item → grade server-side → validate submitted attempt → admit evidence → map reviewed distractor → project misconception → choose targeted remediation → issue fresh targeted confirmation item → update learner state**

## One learner truth

V5 does **not** create a misconception database or a second mutable learner profile.

Misconception state is a read-only projection over the same centrally admitted evidence set already used by mastery and `nextLearningMove`.

If evidence is not admitted, it cannot create, strengthen, clear, or confirm a misconception.

## Diagnosis source

A misconception code is evidence-backed only when all of the following are true:

1. the event is an admitted reviewed assessment event;
2. the authoritative submitted-attempt receipt exists for the same learner and concept;
3. the submitted option is valid for the exact reviewed item/version;
4. submitted option, correctness, score, misconception flag, item reference and timestamp agree with the reviewed answer key and ledger event;
5. the selected wrong option has an explicit reviewed misconception mapping.

Free-form model prose, a browser field, a source string, or a generic `misconceptionSignal=true` is **not** sufficient to assign a specific diagnosis.

## Bounded taxonomy

V5 supports a finite taxonomy:

- `sign_error`
- `formula_selection`
- `unit_conversion`
- `conceptual_inversion`
- `rule_outside_domain`
- `arithmetic_slip`
- `prerequisite_gap`
- `representation_misread`
- `component_confusion`
- `unknown`

Each code has one bounded remediation policy. The model may express that remediation conversationally, but it may not replace the evidence-backed code with a guessed diagnosis.

## Smallest remediation

Examples:

- `representation_misread` → map axes/visual parts to meanings before calculation;
- `formula_selection` → discriminate between the correct formula and the tempting alternative using the quantities actually provided;
- `rule_outside_domain` → contrast one valid case with one case where the rule's required condition fails;
- `component_confusion` → separate independent components before recombining them;
- `arithmetic_slip` → keep the concept and method fixed and repair only the smallest arithmetic step.

## Repair confirmation

Generic later correctness does not automatically erase an earlier diagnosis.

A diagnosis is cleared only by a **later independent admitted reviewed item** whose reviewed distractor map explicitly covers the same misconception code and which the learner answers correctly.

A repeated attempt of the same item/version remains non-independent and cannot manufacture misconception repair or mastery progress.

## Server-owned item selection

The browser never chooses a diagnosis or answer key.

When issuing a new verified check, the server prefers:

1. a fresh reviewed item that explicitly targets the active misconception;
2. otherwise, any fresh reviewed item for the concept;
3. only after the reviewed bank is exhausted, a deterministic repeat.

If learner-evidence validation is temporarily unavailable, item selection fails soft to the reviewed bank without inventing learner state.

## Fail-closed boundaries

- Non-assessment evidence remains excluded from mastery and misconception intelligence until its own verifier-backed receipt exists.
- Missing or inconsistent attempt receipts produce no diagnosis.
- Invalid taxonomy mappings produce no diagnosis.
- A wrong option without reviewed misconception metadata may remain a generic wrong answer; V5 does not invent a cause.
- Self-confidence remains context only.

## Release coverage

The protected Study assessment suite must prove:

- diagnosis metadata never leaks in the public assessment item;
- every declared misconception distractor uses the bounded taxonomy;
- authoritative submitted option and reviewed answer key must agree before evidence admission;
- a reviewed wrong option produces the expected specific diagnosis and remediation;
- unverified future evidence cannot clear a diagnosis;
- repeating the same item cannot manufacture repair;
- a distinct reviewed confirmation item targeting the same code can clear the diagnosis;
- the live issue path selects that targeted fresh item;
- mastery evidence count and learner-state evidence count remain identical.

## Payload budget

The Studio entry chunk retains the hard **300,000 byte ceiling**.

V5 is backend/tests/documentation only and adds **zero surface-specific code to the Studio entry path**.

> Surface-specific code follows the surface. When payload pressure rises, move the dependency; never raise the ceiling.

## Next phase

After V5 is certified and production-gated, the next Study phase is **Adaptive Mastery / Next-Best-Action V6**: use the verified evidence graph and resolved misconception state to choose the next concept, practice mode, retention check, or transfer task without turning mastery into a decorative score.
