# PCL Cognitive Kernel

## Purpose

PCL is Quantora's provider-neutral continuity and judgment layer. Models generate language and candidate work; PCL owns the durable objective, the state of the outcome, the human-control boundary, and the evidence required to call work done.

The architectural promise is:

> Safe + reversible + confident -> act. Ambiguous but reversible -> make the smallest reasonable assumption and inform. Consequential, hard-to-reverse, unsafe, or conflicted -> keep the human as governor.

PCL must remain independent of any individual model provider, Office renderer, IDE/runtime, or tool integration.

## Existing foundations to preserve

The existing Quantora architecture already provides the right building blocks:

- Outcome State: goal, understanding, definition of done, constraints, assumptions, questions, decisions, artifacts, next actions, memory scope and safety.
- Project Outcome Graph: deterministic aggregation of durable project context across sessions and project resources.
- Outcome Navigator: provider-neutral conversation snapshot plus explainable moves such as answer, clarify, recommend, challenge, act, verify, recover, anticipate and close.
- Listening Layer: product signals such as preview, publish, user choice and detected outcome gaps.
- Model routing: provider/model selection remains downstream of PCL.

PCL Cognitive Kernel composes these capabilities; it does not create a second memory system or a second intent router.

## Cognitive loop

```text
OBSERVE
  user turn + project + session + artifacts + tool/UI signals
    |
UNDERSTAND
  objective + current state + definition of done + known/inferred context
    |
JUDGE
  alignment + confidence + risk + reversibility + conflict + missing critical context
    |
GOVERN
  none | inform | approve | choose
    |
ACT
  best capability/model/tool selected downstream
    |
VERIFY
  evidence + quality + definition of done
    |
REMEMBER
  durable decisions, corrections, evidence and outcome progress
    +-----> next turn
```

## Human-in-the-loop contract

Human participation is not a permanent approval dialog. It is proportional to consequence.

| Situation | Gate | Behavior |
| --- | --- | --- |
| Low risk, easy to reverse, sufficient confidence | `none` | Act now; lead with the result. |
| Medium impact, partial reversibility, or low-confidence but safe work | `inform` | Proceed with the smallest reasonable assumption; state only the material assumption. |
| Material ambiguity or conflicting confirmed direction | `choose` | Ask one concise question that resolves the highest-impact uncertainty. |
| High risk, hard to reverse, safety-sensitive or consequential external action | `approve` | Do not execute until explicit approval. |
| Outcome achieved and evidenced | no new work | Close cleanly; do not manufacture follow-up work. |

This is the intended human quality: Quantora should neither interrogate the user before harmless work nor silently take consequential action.

## Durable moat: Outcome ownership, not model ownership

PCL should accumulate structured outcome intelligence that remains useful when the underlying model changes:

1. Objective and definition of done.
2. Confirmed decisions and the rationale behind them.
3. Constraints and commitments.
4. Confirmed versus inferred assumptions.
5. Rejected directions so Quantora does not repeatedly propose paths the user already rejected.
6. Artifact lineage, verification and restore points.
7. Evidence supporting claims of completion.
8. Current next action and its risk/reversibility.
9. Corrections and outcome gaps from prior turns.
10. User approval boundaries and memory scope.

A later state-schema phase should add explicit rejected-option, evidence-ledger and artifact-lineage records without removing the current Outcome State contract.

## Provider boundary

PCL decides **what should happen next and how much human control is required**.

The capability router decides **which capability should perform it**.

The model router decides **which available model is best for that capability under quality/cost/latency constraints**.

This keeps all model vendors replaceable. Model names must never become PCL business logic.

## Verification and "done"

PCL may only call an outcome complete when the definition of done and available evidence support it. A model asserting "done" is not evidence.

Examples of evidence include:

- verified Office artifact
- successful build/test report
- confirmed deployment URL
- tool/provider confirmation for an external action
- user confirmation for a subjective acceptance criterion

## Evolution path

### Phase 1 - Governance kernel

Pure deterministic assessment of outcome alignment, autonomy, human gate, risk, reversibility, completion, evidence coverage, missing critical context and explicit conflicts. No additional model call.

### Phase 2 - Navigator integration

Append the kernel's provider-neutral governance contract to the existing Outcome Navigator directive. Preserve the existing conversation move and verification paths.

### Phase 3 - Cognitive ledger

Persist decisions, rejected directions, evidence, corrections, approvals and artifact lineage as versioned events with source/provenance.

### Phase 4 - Semantic judge only when needed

Use a cheap model call only for genuinely semantic ambiguity that deterministic state cannot resolve. Never classify every turn by default.

### Phase 5 - Cross-surface execution

Use the same PCL state and governance across chat, research, Office, IDE/build, agents and workflow automation.

## Non-negotiable invariants

- No provider hardcoding in PCL.
- Authoritative server state outranks browser-supplied memory.
- One material question at a time.
- Safe reversible work should not be blocked by unnecessary intake.
- High-risk/hard-to-reverse actions require explicit approval.
- Assumptions are not silently promoted to facts.
- A prior rejected direction must not be reintroduced as if new.
- Completion requires evidence.
- Failures produce recovery/correction state, not fabricated success.
- When the outcome is achieved, stop.
