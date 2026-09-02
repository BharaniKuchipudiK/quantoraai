# Study H3.1 — Learner Projection Replay

**Status:** in progress  
**Wave:** H3 — Persistent Scale + Observability  
**Depends on:** admitted Study evidence, mastery estimator, learner model, H2.4 diagnostic breadth

## Purpose

H3.1 establishes one deterministic reconstruction seam for the learner graph before introducing durable snapshot storage.

The event ledger remains the source of truth. A projection is a versioned, derived view over admitted evidence; it may be discarded and rebuilt.

## Contract

For one concept, replay records:

- projection schema version;
- learner-model version;
- mastery-estimator version;
- concept identity;
- admitted evidence count and evidence kinds;
- latest admitted observation timestamp;
- explicit projection clock;
- the derived learner model.

Replay must be deterministic for the same admitted ledger, model versions and injected clock. Evidence input ordering must not change the result.

## Truth boundary

A projection is never an independent mastery source.

- unadmitted evidence does not enter the projection;
- self-report does not become verified understanding;
- a snapshot cannot outvote the durable event ledger;
- model-version changes require replay rather than silent reinterpretation;
- retention remains time-sensitive, so replay requires an explicit `asOf` clock;
- invalid replay time fails closed rather than substituting wall-clock time.

## Runtime integration

The active Study learner-model path now reconstructs through `replayStudyLearnerProjection()` before prerequisite/diagnostic planning. This creates one future persistence seam without changing the learner-facing contract.

## What H3.1 does not do yet

This slice deliberately does not persist snapshots. Storage is the next H3 step after the reconstruction contract is proven by CI and replay tests. Persisting an unstable projection format first would make migrations harder and could create a second learner truth.

## Next H3 slices

1. **H3.2 — Durable snapshot store**
   - server-owned projection table;
   - model/schema version columns;
   - observed-through cursor;
   - safe upsert/read contract;
   - ledger-newer-than-snapshot invalidation.
2. **H3.3 — Long-history replay strategy**
   - bounded delta replay from a compatible snapshot;
   - no arbitrary history truncation changing learner truth;
   - deterministic full-replay parity checks.
3. **H3.4 — Privacy-safe observability**
   - correlation IDs;
   - projection hit/rebuild/invalidation metrics;
   - replay latency and DB-call budgets;
   - no learner payloads or answer keys in telemetry.

## H3.1 exit gates

- active learner reconstruction uses the replay seam;
- same ledger + same clock produces the same projection;
- input ordering cannot change the projection;
- projection records estimator/model/schema provenance;
- invalid replay time fails closed;
- no snapshot table or cache is treated as learner truth;
- type, wiring, test, build, browser and deployed gates remain green.
