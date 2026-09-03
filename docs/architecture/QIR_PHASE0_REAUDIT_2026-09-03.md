# QIR Phase 0 — Re-audit against current `main` (2026-09-03)

Status: **DELTA AUDIT — five of twelve exit answers have changed**
Audit target: `main` at `34ff353` (merge of #516)
Supersedes, without replacing: `QIR_PHASE0_EXIT_GATE.md`, audited at `c6dd9e9`
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

---

## Why this exists

`QIR_PHASE0_EXIT_GATE.md` answered the twelve mandatory exit questions against `main` at
`c6dd9e9`. Current `main` is **281 commits** ahead of that point:

```
$ git rev-list --count c6dd9e93276a3ab9f2c6c76c9c5435211cc162bf..origin/main
281
```

Two things follow, and both matter more than the staleness itself.

**The gate's own status line was never cleared.** It still reads *"AUDIT ANSWERS
COMPLETE; PHASE 1 NOT YET AUTHORIZED"*, and the charter
(`QIR_PHASE0_TRUTH_AUDIT.md`) states: *"Until all twelve have factual answers,
QIR implementation does not advance to Phase 1."* Phases 1, 2 and 5 are built and
shipped. Whether that was the right call is not this document's business — the
work is good and this audit does not argue otherwise. What matters is that a
written gate was passed without being marked passed, which is the same defect
class CLAUDE.md §1 records for CI: **a status is a claim, and nobody read it.**

**Five answers are now materially wrong.** Three of them said a capability was
*absent* or *missing*; that capability now exists. A map that is wrong in exactly
the places you rely on it is worse than no map — the same reasoning §4 applies to
gates. Anyone planning Phase 3 from the old answers would plan to build things
that are already built, and would miss the one thing that actually blocks them.

## Method

Every claim below carries a citation or a reproduction. Nothing here is inferred
from a comment or from the architecture document (charter rule: *"Do not infer
architecture from comments alone; verify the executable path"*).

Three of the twelve questions were **not re-verified** in this pass and are
recorded as such rather than silently carried forward. An unexamined answer
presented alongside verified ones would read as fresh when it is not.

---

## A. The twelve exit answers, re-verified

| # | Question | 2026-09-02 answer | Today | |
|---|---|---|---|---|
| 1 | Where is the goal stored? | no single Run-owned goal record | **CHANGED** | a Run owns it |
| 2 | Where is run state stored? | *authority is absent* | **CHANGED** | durable, server-side |
| 3 | Who decides the next action? | duplicate authority | not re-verified | |
| 4 | Who chooses/changes models? | factually known | **CHANGED** | a third input added |
| 5 | Who invokes tools? | factually known | not re-verified | |
| 6 | Who owns retries and stopping? | duplicate authority | **STANDS** | still two owners |
| 7 | Where is context compacted? | factually known | **SHARPENED** | built, unreachable |
| 8 | Who owns budgets/recovery reserve? | *authority is absent* | **SHARPENED** | built, unreachable |
| 9 | Who owns artifact versions/checkpoints? | *durable authority missing* | **CHANGED** | durable checkpoints |
| 10 | Who alone may declare complete? | factually known | **CHANGED** | still not *alone* |
| 11 | Can another worker resume after a crash? | **NO** | **CHANGED** | yes, conditionally |
| 12 | Migration dispositions | factually known | rows moved (§C) | |

### 1 — The goal is now Run-owned

`src/lib/qir-coding-run-core.js:51` writes `goal: { statement, status: 'confirmed' }`
into the Run at boot, and boot deliberately does not require an artifact, so the
goal survives a worker that dies before producing a single file
(`qir-coding-run-core.js:170-199`).

The audit's other goal-bearing layers (Project State, Outcome State, conversation
snapshots) all still exist. The disposition — *Agent Run owns the active execution
goal, everything else is context* — is now **partially executed**, not pending.

### 2 — Run state is durable and server-side

`api/_lib/qir-run-store.ts` persists the Run over Supabase REST with optimistic
concurrency: every commit sends `expectedVersion: input.record.storageVersion`
(`qir-run-store.ts:258`), so a late worker cannot overwrite a newer snapshot.

**Conditional, and the condition is not visible from this repository.** The store
is gated on two environment variables:

```ts
function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
}
```
— `api/_lib/qir-run-store.ts:19-24`

With either absent, `isQirRunStoreConfigured()` is false and the durable runtime
is a no-op in production while every local test still passes. **Whether these are
set on the production deployment is an open question for the operator** (§D).

### 4 — Model choice now has a third input

The audit recorded two deciders: the browser's selection and the server's route
planner. There is now a third, and it sits between them: durable mission memory.

`src/hooks/useChatStream.js` reroutes off an engine the current mission has
already burned, choosing the replacement from `rankCodingDeskFallbacks` — the
platform's own ordering by measured finish-reliability — and falling back to
routing's own pick when every candidate is burned.

`src/lib/mission-continuation.js` holds the decision as a pure function so it can
be driven by a test rather than matched as source text.

### 6 — Retries still have two owners

This one stands, and is worth stating plainly because today's work may look like
it closed it. It did not.

- The browser owns a per-turn escalation budget: `src/lib/turn-escalation.js`,
  `planTurnEscalation`.
- The server owns its own inference ladder: `api/_lib/inference-control-plane.ts`,
  `planInferenceRoutes` + `maxViableBuildAttempts`, funding up to
  `MAX_BUILD_RUNGS = 2` on a build turn out of `TOTAL_CHAT_BUDGET_MS = 165_000`.

PR #517 makes the server **report** the rungs it burned so the browser and the
durable mission stop under-counting them. That shares *evidence*. It does not
merge *authority*: two components still independently decide how many times this
user's request gets attempted. The disposition (`MOVE`) is unchanged and unstarted.

### 7 — Context: the same shape as budgets

Not re-verified end to end, but one fact about it was measured and belongs here,
because it turns §8 from an isolated oversight into a pattern.

`api/qir-context.ts` is a deployed route over `api/_lib/qir-context-state.ts`
(versioned `qir-context-2026-09-02.1`, with its own test file). Outside its own
module and test, the string `qir-context` appears nowhere in the repository.

### 8 — Budgets: built, tested, and reachable by nothing

The audit said the authority was absent. It is more specific than that now, and
the specific version is more actionable.

A Resource & Budget Governor exists and is complete:

- `api/_lib/qir-resource-governor.ts` — lanes `ordinary | recovery | premium`,
  `evaluateQirResourceGovernor`;
- `api/_lib/qir-resource-ledger.ts` — `debit()` against `runUnitsRemaining`,
  `recoveryReserveRemaining`, `premiumEscalationRemaining`, with capacity-resume
  reduction;
- `api/qir-resources.ts` — an HTTP endpoint over both.

Nothing in the product calls it:

```
$ grep -rn "qir-resources" src shared desktop
(no output)
```

The Run's budget object is therefore initialised
(`qir-coding-run-core.js:59-64`) and never spent. Meanwhile the live decision
this governor exists to make — may this turn escalate to a premium engine? — is
taken elsewhere, from the presence of a credential rather than from a budget:

```js
allowPaid: Boolean(getClientSecret('openrouter'))
```
— `src/hooks/useChatStream.js`, auto-resolution path

**This is the single highest-value gap the re-audit found.** It is not a build;
it is a connection, and the hard half is already done and tested.

#### Why no gate caught either of them

Measured across every route in `api/`:

```
UNREFERENCED: /api/qir-context
UNREFERENCED: /api/qir-resources
UNREFERENCED: /api/study-evidence
```

Two of QIR's own Phase 3 subsystems are deployed routes that nothing calls, and
the gate suite is structurally unable to say so:

- `npm run test:dead-controls` checks **one direction** — every `/api/` path the
  frontend calls is served. It cannot see a path that is served and called by
  nobody.
- `npm run test:wiring` ratchets orphaned **exports and components**
  (`src/lib/wiring-baseline.json`, 13 known). An HTTP route is neither.

So a complete, typed, tested subsystem can ship, deploy, and sit unreachable with
every gate green. That is the §4 condition stated from the other side: not a check
that cannot fail, but an absence of any check at all over a class of defect this
codebase has now produced twice in one phase.

`/api/study-evidence` is listed for completeness and is outside QIR scope — note
that `api/_lib/study-evidence.ts` (the library) *is* used, and
`src/lib/study-evidence-client.js:15` calls `/api/study-assessment` rather than
this route. Confirm before touching it (§9: verify before deleting).

### 9 — Artifact checkpoints are durable

`promoteQirCodingCheckpoint` appends to `run.checkpoints`
(`api/_lib/qir-coding-runtime.ts:97-98`), reached through `coding.promote`
(`api/qir-runs.ts:252, 289`), which the browser calls from `reportPreviewStatus`
once an independent quality verdict passes (`qir-coding-run-core.js:335`).

### 10 — Completion is gated, but not solely owned

QIR's completion gate is real and it is wired:

```ts
status: completion.completionAllowed ? "COMPLETE" : "CHECKPOINTED"
```
— `api/_lib/qir-coding-runtime.ts:130`

The audit's requirement was stronger: *"all local states DERIVE"*. That is not yet
true. `src/hooks/useChatStream.js` still constructs its own pass verdict at three
sites (`codingProof: { ok: true, status: 'pass', … }`), each built from
`proveCodingTurn`.

To be fair to that code: it is a real verifier over real evidence, not a
fabricated claim. The defect is duplication, not invention — **two evidence-based
completion authorities, neither consulting the other.** The disposition
(`MOVE/PROMOTE; all local states DERIVE`) remains correct and remains unstarted.

### 11 — A crashed run can be resumed

The audit's answer was a flat **NO**. The machinery now exists:

- a browser-local pointer to the Run id, and a resume-by-id read on boot
  (`qir-coding-run-core.js:184-190`);
- server-side snapshot + `resumeQirRun`;
- a was-red proof that a broken Preview survives interruption, rejects stale
  callbacks, and completes only after verification
  (`api/_lib/qir-coding-runtime.test.ts:64`).

**Two honest limits.** That proof drives the pure reducers over snapshots; it is
not a live worker being killed. And resume inherits §2's condition — with the
store unconfigured there is nothing to resume from.

---

## B. What the original audit could not have known

Five defects were measured on the execution spine on 2026-09-03. They are recorded
here because they share one shape, and that shape is a finding about the
architecture rather than about any of the five.

| defect | what was already known, and by whom |
|---|---|
| turn budget was a count, not a clock | the deadline and the elapsed time (#506) |
| catalog photos 404'd on a swallowed escape | the proxy knew the URL it was given (#514) |
| a build problem stated twice | the truth note knew both halves (#515) |
| the ladder re-ran the engine that just died | auto knew which engine it resolved to (#516) |
| the server's rungs burned invisibly | the ladder knew every rung it spent (#517) |

**In none of the five was the information missing.** In each, one component held
it, a boundary did not carry it, and the next component guessed. The guesses were
reasonable in isolation and wrong in composition.

That is the architectural argument for QIR stated in evidence rather than in
principle: the spine's failures are not failures of detection or of capability.
They are failures of a shared, durable record. Every one of the five was closed by
making some component *write down* what it already knew.

It is also a warning about how to verify this work. Two of the five (#514, #515)
shipped **through** gates that asserted the halves in isolation while the composed
result went unexamined. A Phase 0 that maps components without exercising the
boundaries between them would miss the same class again.

---

## C. Disposition rows that have moved

Against `QIR_PHASE0_AUTHORITY_DISPOSITION.md` §2:

| Architectural fact | Recorded current authority | Actual, today |
|---|---|---|
| active Run identity | "no durable universal record" | durable, minted per session, surfaced in failure copy |
| Run status | browser turn state, build job, Preview, … | server-owned state machine; browser holds a pointer |
| Run completion | "local states remain distributed" | gated by QIR **and** still decided locally (§A.10) |

The dispositions themselves (`MOVE`, `DERIVE`, `DELETE AFTER MIGRATION`) are
unchanged and remain correct. Only the "current authority" column has moved.

---

## D. Open questions this audit cannot answer from the repository

Recorded rather than guessed, per the charter's first rule.

1. **Are `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set on the production
   deployment?** If not, §2, §9 and §11 are all locally true and production no-ops,
   and no test in the suite would say so. This is the highest-leverage single
   question in this document.
2. **Has a real browser refresh mid-build ever been observed to resume the same
   Run?** The reducer proof exists; the end-to-end observation is not recorded
   anywhere I can find.
3. **Is `/api/qir-resources` deployed?** It exists in the repository; whether the
   route is live is not verifiable from here — though nothing calls it either way.

---

## E. Recommended next move

**Wire the Resource Governor** (Phase 3, §A.8).

It is the only gap the re-audit found where the component is complete, tested,
and disconnected — so the work is connection rather than construction. It
converts premium escalation from *"is a key present?"* into *"can this mission
afford it?"*, which is the mechanism the platform's own promise depends on: try
an engine, and if it cannot, try a better one, and stop honestly when nothing is
left.

Before that lands, question D.1 should be answered, because a governor writing
into an unconfigured store would be the sixth instance of the pattern in §B.

**And close the gate gap in the same PR.** A route that is served and called by
nobody is now a defect class with two instances inside QIR alone, and no gate can
currently see it. The rule has to be precise or it will be muted (§5): a route
with no reference from `src/`, `shared/`, `desktop/` or `scripts/` is either wired
or recorded in a baseline with a stated reason — the same ratchet shape
`test:wiring` already uses, which is what makes a deliberate exception cheap and
an accidental one loud.
