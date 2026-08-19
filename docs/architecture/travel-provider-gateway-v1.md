# Quantora Travel Provider Gateway v1

Status: implementation blueprint + first live adapters

## Decision

Travel is a Quantora capability. It must never depend directly on Duffel, Google,
Expedia, Klook, Viator, Amadeus, or any other supplier from UI/model code.
Every external supplier is an **upstream provider adapter** behind the Quantora
Travel Provider Gateway.

The gateway owns the stable Quantora contract. Providers are replaceable.

## Current V1 provider stack

| Need | Primary provider | Credential | Current capability | Transaction state |
|---|---|---|---|---|
| Flights | Duffel Flights | `DUFFEL_API_KEY` | live offer search | booking disabled until approval/idempotency/evidence flow ships |
| Hotels | Duffel Stays | `DUFFEL_API_KEY` + Stays account entitlement | live accommodation search | booking disabled |
| Destination resolution | Google Places API (New) | `GOOGLE_PLACES_API_KEY` | city/place -> coordinates | read-only |
| Attractions | Google Places API (New) | `GOOGLE_PLACES_API_KEY` | live place discovery/ratings/address | discovery only; no ticket inventory |
| Routes | future Google Routes adapter | future `GOOGLE_ROUTES_API_KEY` | not implemented | read-only |
| Attraction tickets | future activity provider adapter | provider-specific | not implemented | disabled |

The first two secrets are enough for V1 discovery/search. Keep them server-side.
No `VITE_`/browser exposure.

## Upstream flow

```text
Duffel Flights -------------------\
Duffel Stays ----------------------\
Google Places ----------------------> Travel Provider Gateway
Future Expedia/Amadeus/etc. -------/           |
Future Viator/Klook/etc. ----------/            |
                                                 v
                                      normalized Quantora data
```

Provider adapters are responsible only for:

1. authentication/header/version specifics;
2. translating Quantora input into provider input;
3. translating provider output into Quantora contracts;
4. surfacing provider failures honestly.

They must not decide what the user should do.

## Core stable interfaces

```text
searchFlights(FlightSearchInput) -> TravelProviderResult<FlightOption[]>
searchHotels(HotelSearchInput) -> TravelProviderResult<HotelOption[]>
resolveLocation(query) -> TravelProviderResult<PlaceSummary>
searchAttractions(AttractionSearchInput) -> TravelProviderResult<AttractionOption[]>
```

The rest of Quantora sees these contracts only. It never consumes raw Duffel or
Google payloads.

## Downstream flow

```text
Travel UI / conversational request
        |
        v
Quantora Orchestrator
        |
        +--> Context Projection
        |      dates / travellers / preferences / budget / hard constraints
        |
        v
Travel Capability
        |
        v
Travel Provider Gateway
        |
        +--> flight search
        +--> hotel search
        +--> attraction discovery
        |
        v
Normalized options
        |
        v
Deterministic comparison / constraint engine
        |
        v
Proposal to user
        |
        v
EXPLICIT HUMAN APPROVAL
        |
        v
Transaction Boundary (future)
        |
        v
Provider booking
        |
        v
Provider-confirmed evidence
        |
        v
Outcome State + Context Graph + itinerary
```

## Important separation: discovery vs transaction

Search APIs are not booking APIs.

A model may invoke read-only discovery tools. It must never be given direct
booking functions. Booking flows require a separate server-side transaction
contract with all of these controls:

- authenticated user;
- explicit approval tied to exact item/price/terms;
- re-price/re-quote immediately before purchase;
- idempotency key persisted before provider call;
- provider confirmation persisted as evidence;
- no success message before provider confirmation;
- retry rules that cannot double-book;
- cancellation/refund terms captured with the outcome;
- audit event linking user approval -> provider request -> provider result.

## Stability model

### 1. Failure isolation

Provider failures must not bring down chat, Finance, Projects, or the rest of
Quantora. The gateway returns `unavailable`/`error`; no mock data is substituted.

### 2. Timeouts

Every provider call has a bounded wall-clock deadline. Search is allowed more
time than place discovery, but provider waits must stay below the serverless
request deadline. Current defaults are 10-20 seconds by operation.

### 3. Circuit breaking

Repeated failures temporarily open an in-process circuit for that
provider+operation. On Vercel this is intentionally best-effort because function
instances are ephemeral; durable provider health can be added later if traffic
justifies it.

### 4. Retry policy

- read-only/idempotent discovery may retry only on explicitly transient failures;
- booking/purchase is **never blindly retried**;
- transaction retries require the same persisted idempotency key and provider
  semantics that prove duplicate purchase cannot occur.

V1 deliberately does not add generic automatic retries.

### 5. Caching

Cache stable-ish discovery, never price truth:

- destination geocoding: 30 minutes;
- attraction discovery: 5 minutes;
- flight offers: no Quantora cache in V1;
- hotel rates: no Quantora cache in V1;
- final quotes: never treated as valid past provider expiry.

### 6. Freshness/evidence

Every successful provider result contains `provider` and `fetchedAt`.
Transactional outcomes later require provider confirmation identifiers and the
exact quote/price/terms used.

### 7. Graceful degradation

Examples:

- Duffel down -> Travel can still explain destination/attractions from Places,
  but explicitly says live flight/hotel pricing is unavailable.
- Google Places down -> IATA-code flight search can still work; hotel search by
  free-text location pauses unless coordinates are already known.
- attraction booking provider absent -> discovery works; ticket booking is not
  offered as completed.

## Provider replacement / multi-provider future

The gateway makes provider fan-out possible later without changing the model or
UI:

```text
searchFlights
   -> Duffel
   -> Amadeus / other supplier (future)
   -> normalize
   -> deduplicate
   -> score by freshness/coverage/latency
```

Do not add a second supplier until we have evidence the first provider's
coverage, economics, or reliability creates a user problem.

## Secrets and environments

Use separate test/live credentials and Vercel environment scopes.

- Preview/development: Duffel test token; restricted Google Places key.
- Production search: live/read-limited token where provider supports it.
- Production transactions: read-write credential only after transaction boundary
  is implemented and reviewed.

Keys must never enter model prompts, client bundles, telemetry payloads, or
Context Graph values.

## Rollout validation sequence

Environment-variable changes are not retroactive to an already-built Vercel
deployment. After adding or changing provider credentials:

1. confirm the secret is scoped to the intended Vercel environment(s);
2. create a fresh Preview deployment from the Travel/Fabric branch;
3. run a read-only flight search with IATA codes to validate Duffel;
4. run destination/attraction discovery to validate Google Places;
5. run a hotel search only after destination resolution succeeds and Duffel
   Stays entitlement is confirmed;
6. inspect provider/runtime logs for errors, latency and zero-result behaviour;
7. promote to production only after the Preview flow is clean.

A production redeploy of `main` does not validate branch-only Travel code. Keep
provider rollout testing on Preview until the Travel slice itself is ready to
merge.

## Observability required before booking goes live

For every provider operation record non-sensitive telemetry:

- provider;
- operation;
- success/error/unavailable;
- latency bucket;
- result count;
- provider HTTP/error class where available;
- no raw passenger PII or secret-bearing payloads.

Minimum dashboards before transactions:

- p50/p95 provider latency;
- search success rate;
- provider failure rate;
- zero-result rate;
- approval -> booking success rate;
- duplicate booking count (must remain zero).

## Architecture acceptance tests

Travel V1 is architecturally healthy when:

1. removing `DUFFEL_API_KEY` makes flight/hotel tools fail closed, not fabricate;
2. removing `GOOGLE_PLACES_API_KEY` does not break IATA flight search;
3. a Google outage does not crash Duffel flight search;
4. no external provider payload shape escapes the gateway;
5. no secret is browser-visible;
6. no transaction tool is exposed to the model;
7. a future provider can be added by implementing an adapter, not rewriting the
   Travel experience.
