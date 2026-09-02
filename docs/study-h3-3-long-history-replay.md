# Study H3.3 — Long-History Replay

**Status:** foundation in progress  
**Wave:** H3 — Persistent Scale + Observability  
**Depends on:** H3.1 deterministic replay, H3.2 durable derived snapshots

## Purpose

H3.3 makes learner reconstruction safe as the evidence ledger grows beyond the original pilot-scale query limits.

The immediate correctness problem is more important than cache acceleration: the previous verified evidence path read at most 500 mastery rows and at most 500 assessment receipts. Once a learner crossed that boundary, reconstructing from a prefix could silently change mastery, misconception, retention, transfer, and next-best-action state.

H3.3 removes that silent truncation before allowing snapshots to serve learner-facing reads.

## Foundation contract

Verified replay now reads append-ordered pages for:

- `study_mastery_events`;
- `study_assessment_attempts` receipt validation.

Pagination owns `limit` and `offset`; callers provide a deterministic append order.

For mastery events the order is server-owned `created_at, id`. For assessment attempts the order is server-owned `issued_at, id`. Projection semantics remain based on admitted `observedAt`; fetch order is only a stable paging cursor.

## No silent prefix truth

Full replay currently has a defensive ceiling of 5,000 rows per paged result set.

That ceiling is **not** a claim that 5,000 rows are enough forever. It is an operational guard while checkpoint replay is being built.

If more rows exist:

- the paged reader returns `overflow`;
- verified learner evidence returns unavailable;
- the current request does not replace prior learner truth with a truncated projection.

This is intentionally fail-closed.

## Why snapshots are not yet used for delta replay

The H3.2 snapshot stores a derived learner projection, not the full admitted event history or an estimator-specific incremental accumulator.

The current mastery estimator is partly aggregatable, but the learner model also depends on ordered history for:

- misconception diagnosis and targeted correction;
- latest-attempt repair behavior;
- retention anchors, delayed probes, and later successful learning;
- transfer evidence and later repair.

Therefore `snapshot projection + events after observedThrough` is **not yet proven equivalent** to deterministic full replay.

H3.3 must not invent that equivalence.

## Next H3.3 slice — checkpoint parity

Before a snapshot may accelerate learner reads, Quantora must add:

1. a server-only snapshot read contract;
2. strict schema / learner-model / estimator version compatibility;
3. a replay checkpoint representation containing sufficient incremental state, or another formally equivalent compaction;
4. bounded post-checkpoint event loading;
5. deterministic parity tests comparing checkpoint replay with full replay across misconception, retention, transfer, duplicate, and time-advance cases;
6. automatic fallback to full replay on any mismatch, overflow, corruption, or unsupported version.

Only after those gates are green may the learner-facing runtime consume a snapshot-derived checkpoint.

## Truth boundary

- `study_mastery_events` remains the learner source of truth.
- Assessment-backed rows still require authoritative attempt receipts.
- Transfer still requires the canonical `supports_transfer_to` graph.
- Retention timing is still recomputed from server-owned receipts.
- Snapshot availability never creates mastery evidence.
- No H2.3 staged candidate is promoted or consumed.

## Foundation exit gates

- no silent 500-row mastery-event truncation;
- no silent 500-row assessment-receipt truncation;
- append-ordered paging is deterministic;
- histories above the bounded full-replay ceiling fail closed;
- 501-row replay is covered by automated tests;
- existing admission, transfer, retention, and learner-model semantics remain unchanged;
- type, wiring, tests, build, browser, deployed golden, and Vercel gates remain green.
