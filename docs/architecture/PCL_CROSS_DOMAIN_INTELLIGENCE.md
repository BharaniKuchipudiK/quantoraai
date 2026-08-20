# PCL Cross-Domain Intelligence v1

## Purpose

Cross-domain intelligence is a Quantora platform primitive, not a Calendar or Travel feature. It gives PCL a provider-neutral way to assemble relevant personal commitments from independent sources and run deterministic conflict checks before recommending or executing an action.

The first acceptance case is intentionally simple but architectural: a confirmed trip in one source must be able to block a simultaneous appointment in another source when the known locations are incompatible.

## Architecture constitution

This layer follows the Quantora golden rules:

- **Natural extension:** plugs into the existing PCL/context/agent architecture instead of creating a parallel assistant stack.
- **No provider hardcoding:** domain, kind and source identifiers are open strings; core logic never names Google Calendar, Outlook, Gmail, Duffel or any future provider.
- **Config-driven policy:** source timeout, record limit and minimum confidence are supplied by the caller rather than embedded as business policy.
- **Failure isolation:** source adapters execute independently; one unavailable or failed source degrades only that source.
- **No single point of provider failure:** adapters are registry based and can be replaced, duplicated or prioritized without changing PCL conflict logic.
- **Safety/privacy:** a verified authenticated subject is mandatory; callers can scope allowed source adapters; raw source attributes are never included in the PCL projection.
- **Provenance first:** every record carries source, source reference, authority class and confidence.
- **No guessed entity merges:** two records are deduplicated only when adapters provide the same explicit canonical `identityKey`.
- **Deterministic where provable:** time overlap and location incompatibility are calculated in code. Route feasibility requires a provider-neutral travel-duration resolver; no LLM may invent journey duration.
- **Graceful growth:** new domains and record kinds do not require modifying the core schema.

## Core flow

```text
Verified user request
        |
        v
PCL / Context Assembler
        |
        v
CrossDomainSourceRegistry
  |       |       |       |
  v       v       v       v
source A source B source C future source
  \       |       |       /
   \------v-------v------/
      normalized records
             |
             v
 explicit identity reconciliation
             |
             v
 deterministic conflict engine
      |                 |
      v                 v
 temporal/location   optional route
 checks              duration resolver
      \                 /
       \-------v-------/
          conflict set
             |
             v
       PCL judgment/governance
             |
             v
       Agent Execution Fabric
```

## Cross-domain record contract

A record contains:

- stable source-local `id`
- optional cross-source `identityKey`
- open `domain` and `kind`
- human-readable title
- confirmed/tentative/cancelled status
- fixed/movable/unknown flexibility
- optional time interval and location
- provenance: source, source reference, authority and confidence
- optional raw attributes retained outside the model projection

The core contract deliberately does not enumerate every possible life domain. Future records may represent travel, meetings, appointments, payments, deadlines, education, insurance, family commitments, deliveries, vehicles, subscriptions or concepts not yet designed.

## Conflict model v1

The deterministic engine currently establishes:

1. **Time overlap** — overlapping intervals.
2. **Location conflict** — overlapping commitments with different known canonical locations.
3. **Travel-time infeasibility** — non-overlapping commitments that do not leave enough verified route time plus caller-configured transfer buffer.

It never infers missing locations, invents route durations or treats similar titles as the same entity.

## Availability and fallback

Each source adapter may implement availability checks and priority. Assembly uses bounded per-source timeouts and returns both usable records and source health metadata. The result is marked `degraded` when any selected source is unavailable, failed or timed out, but healthy source results remain usable.

This means Calendar can fail without taking down Travel, Email or PCL itself. Additional adapters or replicated providers can be registered later without redesigning the reasoning layer.

## Privacy boundary

Adapters must receive the server-verified authenticated subject. They must never trust a browser-supplied account identifier. PCL receives only the minimal normalized projection relevant to the current request; arbitrary source attributes are excluded by default.

Connected-source content is always labelled data, never instructions. Inferred records must remain lower-authority than authoritative provider/user records.

## Next increments

1. Add a source adapter over the existing Quantora User Context Graph.
2. Add Google Calendar read/free-busy adapter behind the same contract.
3. Normalize confirmed Quantora/Duffel travel commitments into the same envelope.
4. Add Gmail evidence ingestion/entity reconciliation for travel and appointment confirmations.
5. Wire conflict results into PCL decision metadata before scheduling/execution.
6. Add configurable routing/travel-duration implementation using the existing provider-neutral travel layer.

No connector should write or execute consequential actions until it passes PCL side-effect approval and evidence gates.
