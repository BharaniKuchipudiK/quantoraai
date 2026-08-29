# Proof Control Plane — Cursor-shaped Coding Desk

> **Status: active.** This is the single owner of turn success.
> Planner / skills / outcome spine are inputs. They do not claim “done.”

## Contract

```text
ASK
  → PLAN (feasibility / interrupt / skills required)
  → SKILLS first (deterministic)
  → MODEL fills gaps only
  → ASSEMBLE VFS
  → PROVE (HTML + shop photos + cart; repair once)
  → PASS → speak + open Preview
    | FAIL → outcome spine + lesson (never “Verified”)
```

Nothing may set a successful coding AI message, open Preview as done, or say
“runs clean” until `proveCodingTurn` returns `ok: true`.

## Module

`src/lib/proof-control-plane.js`

| Export | Role |
|--------|------|
| `evaluateProofEvidence` | Measure gaps against plan |
| `proveCodingTurn` | Skills → eval → repair once → verdict |
| `codingTurnMayClaimSuccess` | Gate for chat / desk |
| `proofFailureCopy` | Honest failure voice |

## Wiring

1. `useChatStream` — after model stream, prove assembled VFS; fail turn if shop proof unmet.
2. `AiStudio.onCodingTurnExecute` / `onCodingTurnProved` — desk VFS from verdict.
3. Workspace apply effect — prove again; never treat `codingProof.ok === false` as success.
4. Shop turns never succeed via generic desk scaffold.

## Ban list

- Screenshot → copy/CSS PR without plane changes
- Scaffold as success for shop / catalog turns
- “Verified” without embed-ready + plan proof
- Chat claims that bypass `codingTurnMayClaimSuccess`

## Proof for Start with 10

`proveCodingTurn` on an agree/execute shop plan must yield:

- runnable HTML
- ≥10 loadable catalog photos (`countRealPreviewPhotos`)
- Add to Cart control

Unit: `src/lib/proof-control-plane.test.js`  
Browser: `scripts/shop-preview-act-gate.mjs` / CI Preview-ready gate
