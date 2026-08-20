# Study Repository Runtime v1

The Study Repository Runtime is the server-only storage seam between durable Study truth and PCL Advisor Intelligence.

## Boundary

PCL, tutor models and specialist agents do **not** query Supabase tables directly. They receive canonical educational structures and bounded learner evidence through this adapter.

Database UUIDs, service-role credentials and PostgREST layout remain private implementation details.

## Operations

1. **Read Study truth** — load active canonical concepts, prerequisite relationships, curricula and mappings; convert DB UUID references back to canonical keys; validate the graph before use.
2. **Append learner evidence** — write one structured evidence event owned by the verified server-side `userSub`.
3. **Recompute mastery** — re-read the append-only ledger, run the interpretable estimator, then upsert only the derived estimate cache.
4. **Build Advisor candidate** — combine the trusted graph and stored estimates into the existing Study mastery adapter and PCL Advisor contract.

## Idempotency

`study_mastery_events.event_key` is unique per learner. The application uses the normalized evidence event id as that key and writes with conflict-ignore semantics.

A timeout/retry therefore cannot count one answer twice or inflate mastery.

## Ownership and privacy

- callers must supply the already-verified server session subject; browser-provided account ids are never trusted
- free-form raw answers and hidden model reasoning are not written into the mastery ledger
- request errors never log service-role keys, learner ids, query bodies or response bodies
- mastery events remain append-only for ordinary repository operations
- account deletion may still remove owned evidence through the existing database cascade

## Replaceability

The public repository functions are storage contracts, not Supabase contracts. A future Postgres RPC layer, queue-backed writer, warehouse or another durable store can replace the PostgREST backend without changing PCL Advisor Intelligence.

## Advisor integration

`createStudyRepositoryAdvisorAdapter()` plugs directly into the existing `AdvisorDomainRegistry` under domain `education`.

The flow is:

`verified learner -> Study Repository -> Truth + Mastery -> Study Gap Intelligence -> PCL Advisor -> Agent Fabric`

If a prerequisite has no evidence, it stays unknown. The repository-backed advisor therefore recommends a diagnostic before allowing a higher-level weak concept to be called the root cause.

## What v1 does not activate

- no public/client Study database access
- no automatic curriculum ingestion
- no arbitrary model-authored SQL
- no background mastery mutation
- no autonomous exam strategy actions

Next: ingest a small authoritative curriculum pilot through a provenance-reviewed pipeline, then wire real assessment/tutor events into this repository seam.
