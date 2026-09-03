# QIR Milestone 1 — handover

Status: surgical cutover in progress on `codex/qir-production-recovery-cutover` (PR #491).
Audience: the next engineer or ChatGPT session that continues this work.
Rule: do not rebuild workspaces. Touch only the ownership seams named below.

## What this milestone is

Make the **already-built** QIR journal see real Coding attempts, and stop Study / Travel / Finance / Research from speaking Coding Preview recovery.

It is **not**:

- a rewrite of `useChatStream`
- a new agent loop
- Temporal / desktop / token-meter product work
- a merge of later `main` Study / landing / desktop drafts

## Sacred constraints

These rooms already work. Do not inject QIR or Preview recovery into them.

| Room | Must keep |
|---|---|
| Study Tutor | Teaching copy. Route death uses `describeTurnFailure`, never Preview / shop / "Retry a smaller build". |
| Travel | Live flights / hotels, Places honesty. `TRAVEL_FLIGHT_PROVIDER` recovery stays as-is. |
| Finance / Research | Advisor answers. No Coding desk, no Preview spine. |
| Office | `/api/generate-office` path is separate. Do not route it through QIR. |
| Coding Desk happy path | Planner, proof control plane, skills-first, Preview, existing auto-recovery. QIR journals; it does not replace proof. |

`advisorBlocksPreviewBuild(domain)` is the backstop: `education | travel | finance | research`.

## What already existed before this handover

On the PR branch, before the surgical pass:

- Study flashcards no longer classify as a Coding request (`LEARNING_ACTIVITY` in `shared/build-intent.js`).
- Step-deadline recovery auto-replans once (`resolveTurnRecovery` + `deadlineRecoveryBrief`).
- QIR seams exist: `beginModelAttempt` / `reportModelFailure` in `useQirCodingRun` and `qir-coding-run-core`.
- Studio **displays** a QIR run chip and reports Preview / healed artifacts.
- `useChatStream` did **not** start or fail those QIR actions.
- CI was red on one stale regex: test wanted `smaller`, implementation says `smallest`.

## Surgical changes in this pass

One new helper, used as the only failure-spine gate:

```js
codingFailureSpineOwnsTurn({ isCodingRequest, studioDomain })
// === isCodingRequest && !advisorBlocksPreviewBuild(studioDomain)
```

Then, and only then:

1. **CI:** `turn-recovery.test.js` matches `smallest independently useful runnable slice`.
2. **Study isolation:** every `resolveCodingTurnOutcome` site in `useChatStream` now requires `codingSpineOwns`, not a bare `if (isCodingRequest)`. Advisor rooms fall through to the existing non-coding `describeTurnFailure` copy.
3. **QIR journal, Coding only:** optional `onCodingModelAttempt` / `onCodingModelFailure` callbacks. `AiStudio` binds them through `qirCodingApiRef` so hook order does not change. Study cannot start a Coding Run because `notifyCodingAttempt` no-ops when the spine does not own the turn.
4. **Was-red pins:** `qir-production-recovery-contract.test.js` locks the helper, the stream gates, and the Studio wiring.

`useQirCodingRun({ enabled })` is unchanged. Background sync still requires Coding desk + preview bytes. `beginModelAttempt(..., force)` may persist a goal before files exist — that is intentional for the boutique timeout case.

## What is still remaining

Do these in order. Do not start Phase 4 / 5 / token UI from this branch.

1. **Prove CI green** on the exact PR head. The previous red check was `user stop remains terminal for the turn, but a step deadline auto-replans once`.
2. **Do not merge `main` blindly.** `main` has moved (Study H3.5, chrome, more QIR files). Rebase only with a human, file-by-file. This PR must stay a cutover, not a Study merge.
3. **Browser was-red journeys** live in `scripts/qir-production-recovery-browser-gate.mjs` and are a required CI gate.
   - Study flashcards + fatal route death → no Preview / shop / Retry-smaller copy, and no QIR Coding attempt.
   - Coding first-route death → automatic second attempt, QIR journals the attempt, no Retry chip.
   - The 175s step-deadline *decision* stays in the unit contract. Do not add a production deadline backdoor to wait it out in Playwright.
4. Close **#485** and **#487** only after those two journeys pass on the exact head.
5. Later, not this PR: Phase 3.3 proving slice (#475), Tool Fabric (#471), Outcome Engine (#472), token / usage meter, Temporal.

## How to continue without breaking the platform

- Prefer adding a gate around existing copy over writing new copy.
- Prefer optional callbacks over importing QIR inside `useChatStream`.
- If a change would run in Study, Travel, Finance, Research, or Office, stop.
- If a change would alter a green Coding Preview / proof path, stop.
- Keep `MAX_TURN_ATTEMPTS = 2`. The 175s number is a step deadline, not mission lifetime.
- Never weaken verifier, payload, authz, or Golden Transaction gates to make CI green.

## Files that should stay in this PR

- `shared/build-intent.js` + `src/lib/build-intent.test.js`
- `src/lib/turn-recovery.js` / `.test.js` (already on the branch; only the stale regex in this pass)
- `src/hooks/useChatStream.js`
- `src/components/AiStudio.jsx` (callback wiring + one ref only)
- `src/hooks/useQirCodingRun.js`, `src/lib/qir-coding-run-core.js`, `api/qir-runs.ts` (already on the branch; do not expand)
- `src/lib/qir-production-recovery-contract.test.js`
- this handover

If a new file is not in that list, it probably does not belong on Milestone 1.
