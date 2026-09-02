# Study H3.2 — Durable Learner Snapshots

**Status:** implementation in progress  
**Wave:** H3 — Persistent Scale + Observability  
**Depends on:** H3.1 deterministic learner-projection replay

## Purpose

H3.2 persists the H3.1 learner projection as a server-owned, disposable cache without creating a second learner truth.

The authoritative path remains:

`admitted evidence ledger -> deterministic replay -> learner projection -> adaptive planning`

The snapshot is synchronized only after replay and cannot override the projection used by the current request.

## Why H3.2 is write-through only

Retention state depends on time even when the evidence ledger does not change. A snapshot may therefore become semantically stale solely because the clock advances.

H3.2 deliberately does **not** serve learner-facing state directly from stored snapshots. H3.3 must first add bounded delta replay and deterministic parity checks before snapshots may accelerate learner reads.

## Stored contract

One row is stored per learner and concept with:

- projection schema version;
- learner-model version;
- mastery-estimator version;
- ledger `observed_through` cursor;
- projection clock;
- derived projection JSON;
- server update time.

Raw evidence events are never copied into the snapshot payload.

## Security boundary

`study_learner_snapshots` is server-owned:

- RLS enabled;
- no `public`, `anon`, or `authenticated` privileges;
- service role receives only `select`, `insert`, and `update` table capabilities;
- ordinary Study code has no snapshot-delete capability;
- the save RPC is executable only by the service role;
- snapshot transport logs operation/status only, never learner-scoped URLs or payloads.

## Single-round-trip synchronization

A consented Study turn pays at most one snapshot database request. The save RPC owns classification and synchronization atomically rather than performing a client-side read followed by a second write.

The RPC returns only:

- `current` — same ledger cursor, versions and semantic projection; no write needed;
- `saved` — missing or legitimately changed derived state was stored;
- `snapshot_ahead` — stored ledger cursor is newer than the incoming replay, so the incoming request is not allowed to regress it.

`projectedAt` alone does not force a write. It is excluded from the semantic projection comparison, while time-sensitive learner-model changes still cause `saved` because they change the derived model itself.

## Monotonic concurrency rule

The save RPC refuses to replace a stored snapshot whose ledger cursor is newer than the incoming replay.

This protects against the race:

1. request A replays ledger through event N;
2. request B replays ledger through newer event N+1 and saves;
3. request A finishes later;
4. request A must not regress the snapshot back to event N.

The RPC locks an existing row before classification and also keeps a monotonic `ON CONFLICT` predicate to protect the concurrent-first-insert race.

Equal cursors may update because schema/estimator versions or time-sensitive learner-model state can legitimately change without a new evidence event.

## Runtime behavior

For a consented Study request:

1. resolve the active canonical concept;
2. load and admit governed evidence;
3. replay the H3.1 projection using the current clock;
4. synchronize the derived snapshot in one bounded RPC;
5. continue prerequisite/diagnostic planning from the freshly replayed learner model.

If snapshot storage is unavailable, learner reconstruction continues from the ledger. Snapshot availability must never determine mastery truth.

## H3.2 exit gates

- durable server-owned snapshot table exists;
- snapshot contains no raw evidence ledger;
- schema/model/estimator provenance is persisted;
- synchronization fails soft on storage outage;
- snapshot maintenance adds no client-side read-before-write round trip;
- unchanged semantic projections avoid redundant writes;
- older concurrent replay cannot overwrite a newer ledger cursor;
- browser roles cannot read or mutate snapshots;
- production Study path writes only after deterministic replay;
- production Study path does not consume snapshot state as learner truth;
- type, wiring, test, build, browser, deployed golden and Vercel gates remain green.

## Next

**H3.3 — Long-history / bounded delta replay** will introduce the snapshot read contract, define when a compatible snapshot can be trusted as a replay checkpoint, apply only newer admitted ledger events, and continuously prove parity against deterministic full replay.
