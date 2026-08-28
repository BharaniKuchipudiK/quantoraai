# ADR — Capacity Control Plane, Phase 0: Observe Before Enforce

**Status:** Proposed / implemented in shadow mode  
**Policy version:** `qcu-shadow-v1`

## Decision

Quantora will not begin capacity management with a hard token limit.

The first production-safe slice is a deterministic **Capacity Request Envelope** created at the common communication ingress, before model routing. The envelope classifies the work and estimates relative Quantora Compute Units (QCU) without changing whether the request is allowed.

This branch intentionally makes **no pricing change, no user-facing quota change, and no hard admission decision**.

## Why this is first

A mature capacity system needs four independent controls:

1. **Context capacity** — how much working state can safely reach the selected model.
2. **Burst/rate capacity** — how quickly requests may arrive.
3. **Rolling compute capacity** — expensive work consumed in windows such as five hours and one week.
4. **Concurrency capacity** — how many heavy agent jobs may run at once.

Provider tokens are only one cost input. Builds can also consume retries, browser/tool calls, sandboxes, verification, agent steps, and wall-clock compute. Therefore the user entitlement must be vendor-neutral.

## Phase-0 contract

Every normalized communication request now receives:

- `policyVersion`
- `taskClass`: `light | standard | build | deep`
- `requestedMode`: `light | build | deep`
- `heavy`
- `estimatedQcu`
- `estimatedContextTokens`
- machine-readable `reasons`

The envelope never contains prompt text, history text, credentials, or other raw user content.

## Invariants

- **No behavior change:** Phase 0 cannot deny, queue, downgrade, or upsell a request.
- **Model independence:** classification happens before the model router.
- **Version everything:** estimator changes create a new policy version so historical data stays interpretable.
- **No false precision:** QCU is relative until calibrated against real execution data.
- **Privacy by construction:** only numerical/classification metadata belongs in capacity telemetry.
- **Fail open in shadow mode; fail closed for paid spend later:** observation must never break chat, while future server-funded spend must never continue when its durable ledger is unknown.

## Rollout sequence

### Phase 0 — Request envelope (this branch)

Classify and estimate every turn at ingress. Lock invariants with tests. Do not enforce.

### Phase 1 — Durable shadow ledger

Persist admission envelopes and settlement facts: provider tokens/cost when available, latency, retries, tool/sandbox time, verification work, completion outcome, and cache savings. Calibrate QCU weights from real Quantora traffic.

### Phase 2 — Atomic reserve / settle

Introduce one durable transaction boundary:

`estimate -> admit -> reserve -> execute -> settle/release`

Reservation must be atomic per account/workspace so concurrent agents cannot race through the same allowance.

### Phase 3 — Soft pressure

Show context, five-hour, weekly, and active-agent pressure. At high pressure prefer cheaper routing, compaction, caching, and queued background work. Still avoid hard blocking where a light route can complete the task.

### Phase 4 — Entitlements

Attach policy to Free / Pro (and only later Pro+ if usage data proves the need). The entitlement layer selects limits; the execution layer does not contain plan-specific conditionals.

### Phase 5 — Enforcement

Enforce only after shadow data proves that false-positive degradation is acceptably low and unit economics are understood. Heavy work degrades or queues before the product becomes unusable.

## Next engineering slice

The next branch should add the durable capacity ledger and a single atomic reservation RPC, not UI. The acceptance criterion is that two simultaneous heavy requests for the same account cannot both reserve capacity that only one request owns.

Only after that invariant is proven should Quantora add the usage tray, five-hour/weekly reset UX, or paid-plan entitlement switches.
