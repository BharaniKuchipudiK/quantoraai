# Detect → Diagnose → Verify → Apply: the golden standard

This is the platform's one self-healing loop. Every retry, repair, fallback,
and refinement in Quantora is an instance of it, and every instance is held to
the same four laws. `CLAUDE.md` states the doctrine; this document is the
operating standard: what each phase owes, who owns it at each level, and the
gate that adjudicates it.

## The motivating incident (2026-09-01)

A boutique-website build turn failed `BUILD_ARTIFACT_CONTRACT` — the model
answered in chat, no files. The platform then:

1. **Detected** the failure correctly (the artifact contract fired).
2. **Diagnosed** it correctly (`code-fences-missing`, named in the public error).
3. **Applied** a retry that changed *nothing* — the identical prompt was
   re-sent to the identical model, which failed identically.
4. Rendered a terminal message that read **"What we'll do: retry once on a
   fallback engine … not another silent retry loop."** — in the one state where
   no retry would ever run, about a fallback engine no code ever selected.

Detect and Diagnose were real. Apply was the same experiment billed twice, and
the closing copy promised the future in a state with no future. That is the
whole failure class this standard exists to kill: **a loop that narrates
self-healing instead of performing it.**

## The four phases and what each one owes

### 1. Detect — a signal, not a vibe

A detection is a concrete predicate over evidence: an error code, a contract
violation, files absent from the desk, a stream that ended without `[DONE]`.
"It seems broken" is not a detection. Detection is cheap and always on; it
never mutates anything.

### 2. Diagnose — a class, with the evidence attached

A diagnosis maps the signal to a **failure class**, because the class decides
the repair:

| class | example signal | nature |
|---|---|---|
| behavioral | `BUILD_ARTIFACT_CONTRACT` (chat answer, no files) | the model ignored the contract |
| transport | route dead, gateway 5xx, stream dropped | the request was fine, the route was not |
| budget | turn deadline hit | the work was too big for the window |
| user | Stop pressed | not a failure at all |

The diagnosis carries its evidence (the actual error sentence, the status
code) forward — the repair and the user-facing copy both quote it, never a
paraphrase.

### 3. Verify — an independent adjudicator, named in advance

**A repair may only be applied when something other than the repairer will
judge it.** The verifier must be named before the repair runs:

- A rebuilt coding turn is judged by the artifact contract and the desk proof
  (`proveCodingTurn` — files exist, imports resolve, Preview can start), never
  by the model's claim that it rebuilt.
- A generated site's repair round is judged by `verify-build.ts`, never by
  `repair.ts`.
- A platform change is judged by the gate suite, never by the agent that made
  it.

If no verifier can adjudicate a repair, the repair is not applied — the loop
escalates to a person instead. *An agent may fix anything a gate can
adjudicate; anything else needs a human.* That line is the entire autonomy
policy, and widening what the gates adjudicate is the only way autonomy grows.

### 4. Apply — a different experiment, or none

Two laws, both learned the hard way and both mechanical now:

- **MEMORY** — an applied repair must differ from the attempt that failed, and
  the difference must match the diagnosis:
  - behavioral → same engine, **strengthened brief**: `retryBrief` names what
    the last attempt did wrong (`turn-recovery.js`), the same law
    `shared/refinement-loop.js` enforces with `formatAttemptMemory` for
    artifact rounds. A retry that differs in nothing is the same experiment
    billed twice.
  - transport → same brief, **different engine**: `switchModel` moves the retry
    to a real fallback picked from the live catalog (`useChatStream.js`).
  - budget → **smaller scope**, or a checkpoint when steps are already proved
    on the desk.
- **EVIDENCE-BASED STOP** — the loop ends on a pass, a plateau, an unchanged
  repair, or a spent budget (`planRefinementRound`), never merely because it
  tried once, and never silently past its bound.

### Escalation — the human joins with the loop's real history

When the budget is spent, the loop hands over. The handover is held to the
same honesty as the loop:

- It states **what the loop actually did** — attempts made, engines tried —
  from the loop's own record (`triedEngines`), not from hope.
- It **never promises action**. Terminal copy renders after the code that
  could retry has returned; "what we'll do: retry" in that state is a lie by
  construction. The next move belongs to the user and is expressed as a chip
  they tap (`coding-outcome-spine.js`).
- A single-attempt failure never invents a history it did not have.

## Who owns each phase, at each level

| level | Detect | Diagnose | Verify | Apply | escalation |
|---|---|---|---|---|---|
| **turn** (a chat/build turn) | stream error, `!receivedDone`, no files on desk | `resolveTurnRecovery` (class → repair) | artifact contract + `proveCodingTurn` | retry with `retryBrief` / `switchModel` in `useChatStream` | `resolveCodingTurnOutcome` with `attemptsMade`/`triedEngines` |
| **artifact** (the user's generated site) | `verify-build.ts` scores | issue list per round | `verify-build.ts` re-run | `repair.ts`, paced by `shared/refinement-loop.js` | `describeRefinementStop` |
| **platform** (Quantora itself) | gate suite red | the gate's own output (§8: readable with the bug present) | the gate suite — never a model | an agent may fix what a gate adjudicates | a person, for everything else |

## The gate on the standard itself

`src/lib/turn-heal-contract.test.js` adjudicates the turn level:

- terminal copy never promises a retry the loop will not run;
- an exhausted turn reports the attempts and engines actually tried;
- a behavioral failure retries **with memory** (the brief quotes the failure);
- a transport failure retries **on a different engine**, and the notice claims
  a switch only when a real fallback exists;
- the budget bounds the loop for every diagnosis.

It was verified two-way (§2): written first, run against the pre-fix code, and
red on every assertion marked `[was-red]` before the fix landed.

## Extending the standard

Adding a new self-healing behavior? It ships in the same PR as:

1. its **diagnosis class** (what signal, what evidence),
2. its **matched repair** (how attempt 2 differs from attempt 1),
3. its **named verifier** (what adjudicates the repair, independently),
4. its **honest terminal state** (what the user reads when the budget is
   spent — facts and a chip, no promises),
5. the **gate** that fails when any of the four is violated.

A self-healing loop missing any of the five is narration, not healing.
