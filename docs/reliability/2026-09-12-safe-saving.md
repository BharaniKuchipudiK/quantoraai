# Coding Desk saving and worker readiness — 12 September 2026

Baseline: production main fb7759a2 (PR #715). Work isolated from the older Study Tutor checkout.

## Change

Checkpoint replacement uses one database transaction with an advisory lock scoped to user and session. It compares the caller's revision, inserts the complete replacement and retires the prior generation atomically. It does not derive ordering from wall-clock timestamps. Both browser and QIR worker use this RPC. A conflict returns HTTP 409; no partial history is acknowledged. Browser saves are serialized per open desk, hold immutable request snapshots and advance revision only after acknowledgement. Conflicts and uncertain acknowledgements block further writes and show a warning while keeping local work. A stale initial baseline cannot replace the loaded chain.

This protects durable Coding Desk checkpoint history. It is not a claim about all account settings, chat metadata or every persistence path in the product.

## Database changes applied

On QuantoraAI Supabase project tgkgpdnoumuvazcfvsge:

- Added `replace_desk_checkpoints` from the new migration. Existing production writers do not use it until the code deploys.
- Applied the already-merged `20260912030000_qir_worker_leases.sql`, which was missing from production. It creates the worker lease table and claim/heartbeat/release functions.

Verified the CAS RPC with isolated data: initial write, rejection of stale revision, preservation of winning bytes, next revision, old generation removal, and restricted function execution. Also dispatched two independent RPC requests with expected revision 0: one saved revision 1, one conflicted. Verified the winning row and removed the synthetic fixture; zero test rows remain.

Verified lease claim, rejection of another live owner, expiry/reclaim, rejection of the former owner's heartbeat and release. That fixture was rolled back. These are database tests, not production worker process fault injection.

## Validation

- Full local regression suite passed after correcting an unsupported browser API found by its compatibility gate.
- Typecheck and frontend/worker production build passed.
- Focused tests cover save ordering, immutable snapshots, two competing clients, missing acknowledgements, stale baselines, RPC conflict reporting and browser changes between worker read/write.
- Existing worker SIGKILL/restart proof passed locally with no duplicated committed steps. It uses local storage, not production.

## Remaining release and worker work

Deploy the application changes before claiming the production save path is protected. Old tabs without a revision will receive a reload-required conflict once the API is deployed. Do not roll back to timestamp-based saves while claiming concurrent-writer safety.

Production lacked the worker lease schema. That prerequisite is now installed, but the standalone hosting service has not been identified or verified. The current AiStudio caller does not opt into server execution. Enable server ownership only after a healthy service is confirmed, then prove browser absence, provider failure, and worker restart on isolated production runs.
