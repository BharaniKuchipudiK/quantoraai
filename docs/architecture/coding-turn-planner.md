# Coding Turn Planner — operating doctrine

> **Status: active track.** This replaces PR-per-screenshot bandaids for Coding Desk.
> If a change does not go through the planner, it does not ship.

## Why

Users do not experience “CSP,” “CORP,” or “intake chips.” They experience:

1. I asked for an outcome.
2. Did the platform understand whether it can deliver?
3. Did it prove the outcome, or waste my time?

Without a turn owner, Quantora is a glorified HTML console with a spinner.
That is unacceptable.

## Cursor-shaped loop (what we are building)

```text
PROMPT
  → ANALYSE intent + constraints
  → REQUIRE skills / capabilities
  → FEASIBILITY (can we prove this in Preview this turn?)
  → if no: INTERRUPT with proposal (no model burn)
  → if yes: PICK model + EXECUTE plan
  → PROVE (Preview / probes / files)
  → if fail: OUTCOME SPINE (what failed → what next)
```

The model is a **tool inside the loop**, not the loop.

## Non‑negotiables

1. **No coding model call** without a `CodingTurnPlan`.
2. **Unavailable skills are named** (e.g. “100 unique AI mockups in one turn”) — never silently attempted.
3. **Proof is part of the plan** — Preview HTML, real photos, cart — not chat claims.
4. **Deterministic skills run when they can** (photo inject, commerce UI) instead of hoping the LLM invents them.
5. **One partner voice** — interrupt, status, and failure all speak the same contract.

## What “perfection” means for v1

Not every domain. **Coding Desk only:**

- Analyse shop / app / refine intents.
- Skill registry with availability.
- Hard interrupt when proof is impossible.
- Model hint for Auto (ordinary vs escalate).
- Status label from the plan, not from model stream lies.
- Failure through outcome spine.

Travel/Finance/Study keep their advisors until Coding Desk is trustworthy.

## Ban list (until planner owns the turn)

- Symptom-only Preview CSS/status patches without planner changes
- New “honesty copy” that still calls the model on known lies
- Parallel feature PRs that bypass `planCodingTurn`

## Module

`src/lib/coding-turn-planner.js` — single entry: `planCodingTurn(...)`.
`useChatStream` must gate on it. Scraps (`assessPartnerInterrupt`, shop scale, auto-model) become **inputs** to the planner, not competing owners.
