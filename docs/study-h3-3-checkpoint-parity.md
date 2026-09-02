# Study H3.3 — Checkpoint and Delta Replay Parity

Status: implementation in progress

## Purpose

H3.3 allows long-lived learner histories to avoid repeated full-ledger reconstruction only after checkpoint + delta replay is proven to produce the same learner projection as authoritative full replay.

The learner event ledger remains the source of truth. A checkpoint is disposable derived replay state, never an alternate mastery record.

## Replay contract

One reconstruction seam owns both active-concept and prerequisite learner state:

1. Read a server-owned checkpoint for learner + concept.
2. Validate checkpoint, projection, learner-model, estimator and evidence-admission versions.
3. Read only ledger rows appended after the checkpoint's server-owned `(created_at, id)` cursor.
4. Re-validate assessment-backed delta evidence against authoritative submitted-attempt receipts.
5. Fold admitted delta evidence into the same mastery and learner-model accumulators used by full replay.
6. Recompute time-sensitive retention state from the current injected replay clock.
7. Persist the advanced projection and checkpoint atomically under a monotonic append cursor.

Any uncertainty falls back to bounded full replay.

## Why `observedThrough` is not the delta cursor

`observed_at` is semantic learning time. A row can be appended later while carrying an older observation time. Using `observedThrough` as a database cursor could therefore skip a late-appended/backdated event.

H3.3 keeps two concepts separate:

- append cursor: `(created_at, id)` owned by the server/database;
- semantic learner time: `observedThrough` derived from admitted evidence.

A delta event whose semantic `observedAt` is not strictly later than the checkpoint's semantic observation frontier forces full replay so chronological misconception, retention and transfer semantics cannot be reordered accidentally.

## Sufficient checkpoint state

The checkpoint contains derived fold state only:

- mastery accumulator;
- learner-model accumulator;
- seen governed assessment item/version references needed to preserve independent-evidence deduplication across the checkpoint boundary;
- projection schema version;
- learner-model version;
- mastery-estimator version;
- evidence-admission version;
- concept identity;
- server append cursor.

It does not copy the raw evidence ledger, submitted options, response latency, learner self-confidence, source payloads or assessment receipts.

## Bounded delta policy

The initial checkpoint delta window is capped at 500 appended evidence rows.

If more than 500 rows have accumulated after a checkpoint, H3.3 does not truncate the delta and does not serve stale snapshot state. It performs the authoritative bounded full replay established by the H3.3 long-history foundation and refreshes the checkpoint.

## Compatibility and fallback

Checkpoint acceleration is rejected when any of the following is true:

- checkpoint version mismatch;
- projection schema mismatch;
- learner-model version mismatch;
- estimator version mismatch;
- evidence-admission version mismatch;
- learner/concept mismatch;
- malformed checkpoint or cursor;
- late-appended backdated semantic evidence;
- delta overflow;
- checkpoint/delta/receipt-validation storage unavailable.

Fallback means full admitted-ledger replay. It never means using a stale checkpoint because storage failed.

## Persistence boundary

`study_learner_snapshots` remains server-owned with RLS enabled and browser roles denied. H3.3 adds an all-or-none checkpoint bundle and a separate `save_study_learner_checkpoint` RPC so the H3.2 projection-only write path remains backward compatible.

Projection + replay checkpoint + append cursor advance atomically. Older concurrent requests cannot regress a newer append cursor.

## Parity proof

Automated tests require checkpoint + delta output to equal full replay for:

- misconception signal and targeted repair;
- delayed retention evidence;
- governed transfer evidence;
- governed item/version deduplication across the checkpoint boundary;
- time advancement with no new evidence;
- incompatible versions;
- backdated appended evidence;
- bounded delta overflow;
- server append-cursor query semantics.

## Exit criterion

H3.3 is complete only when the exact PR head passes repository typecheck, lint, runtime-import and wiring gates, all tests/build/audit, browser release gates, deployed golden transactions and Vercel, with both active learner reconstruction and prerequisite reconstruction routed through the same checkpoint-aware loader.
