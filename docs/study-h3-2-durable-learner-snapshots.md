# Study H3.2 — Durable Learner Snapshots

**Status:** implementation in progress  
**Wave:** H3 — Persistent Scale + Observability  
**Depends on:** H3.1 deterministic learner-projection replay

## Purpose

H3.2 persists the H3.1 learner projection as a server-owned, disposable cache without creating a second learner truth.

The authoritative path remains:

`admitted evidence ledger -> deterministic replay -> learner projection -> adaptive planning`

The snapshot is written only after replay and cannot override the projection used by the current request.

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
- service role receives only the table capabilities required for derived-cache maintenance;
- the save RPC is executable only by the service role;
- snapshot transport logs operation/status only, never learner-scoped URLs or payloads.

## Monotonic write rule

The save RPC refuses to replace a stored snapshot whose ledger cursor is newer than the incoming replay.

This protects against the race:

1. request A replays ledger through event N;
2. request B replays ledger through newer event N+1 and saves;
3. request A finishes later;
4. request A must not regress the snapshot back to event N.

Equal cursors may update because schema/estimator versions or time-sensitive learner-model state can legitimately change without a new evidence event.

## Compatibility states

The runtime classifies stored state as:

- `current`;
- `missing`;
- `version_mismatch`;
- `concept_mismatch`;
- `ledger_advanced`;
- `snapshot_ahead`;
- `projection_changed`.

`snapshot_ahead` is fail-closed: the older replay never overwrites it.

## Runtime behavior

For a consented Study request:

1. resolve the active canonical concept;
2. load and admit governed evidence;
3. replay the H3.1 projection using the current clock;
4. synchronize the derived snapshot;
5. continue prerequisite/diagnostic planning from the freshly replayed learner model.

If snapshot storage is unavailable, learner reconstruction continues from the ledger. Snapshot availability must never determine mastery truth.

## H3.2 exit gates

- durable server-owned snapshot table exists;
- snapshot contains no raw evidence ledger;
- schema/model/estimator provenance is persisted;
- read and write contracts fail soft on storage outage;
- older concurrent replay cannot overwrite a newer ledger cursor;
- browser roles cannot read or mutate snapshots;
- production Study path writes only after deterministic replay;
- production Study path does not consume snapshot state as learner truth;
- type, wiring, test, build, browser, deployed golden and Vercel gates remain green.

## Next

**H3.3 — Long-history / bounded delta replay** will define when a compatible snapshot can be trusted as a replay checkpoint, apply only newer admitted ledger events, and continuously prove parity against deterministic full replay.
