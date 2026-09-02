# Study H3.4 — Privacy-safe Observability and SLOs

**Status:** implementation in progress  
**Depends on:** H3.1 deterministic projection replay, H3.2 durable snapshots, H3.3 checkpoint/delta parity

## Purpose

H3.4 makes the Study learner-state hot path operationally explainable without weakening learner truth or logging sensitive learner material.

The authoritative ledger and H3.3 checkpoint rules do not change. Telemetry is diagnostic only. A telemetry failure or SLO breach must never promote mastery, bypass evidence admission, or make stale checkpoint state authoritative.

## Privacy boundary

Study operational telemetry may contain only bounded server-owned metadata:

- random correlation/trace ID;
- telemetry and SLO contract versions;
- operation/event name from a closed server-owned set;
- success/unavailable/error status;
- replay source (`checkpoint_delta` or `full_replay`);
- bounded fallback reason code;
- bounded error class name;
- elapsed milliseconds;
- Study Supabase request count;
- SLO classification.

It must not contain:

- `user_sub`, learner/session identifiers or hashes derived from them;
- prompts, answers, answer keys, misconception prose or learner messages;
- REST paths, query strings or request/response bodies;
- assessment receipts/item payloads;
- service-role credentials, provider keys or raw exception messages.

There is intentionally no arbitrary metadata bag in the telemetry API.

## Correlation model

`loadStudyLearnerModel()` establishes one server-owned async telemetry scope. Active-concept reconstruction and any prerequisite traversal remain under that same random trace ID. The common Study Supabase transport increments the scope DB-call counter for every actual REST request.

Projection-load events are emitted independently inside that scope so an incident can distinguish:

- checkpoint + bounded delta success;
- authoritative full replay;
- checkpoint miss/unavailable;
- delta unavailable/overflow;
- checkpoint replay rejection (including unsafe backdated semantic ordering);
- full replay unavailable.

## Initial production SLO targets

These are H3.4 engineering targets, not learner-facing product claims. They are versioned in `study-slos.ts` and must be revised from privacy-safe production distributions, not silently loosened after regressions.

| Projection path | p95 latency target | DB-call budget |
| --- | ---: | ---: |
| checkpoint + bounded delta | <= 750 ms | <= 6 |
| authoritative full replay | <= 2,000 ms | <= 12 |

SLO classification is observational in this phase. A breach is reported but does not cause a learner request to fail or switch to a less-correct path.

## Required operational distributions

Production dashboards/log aggregation should compute, at minimum:

- projection source ratio: checkpoint/delta vs full replay;
- fallback reason rate;
- projection latency p50/p95/p99 by source;
- DB calls per projection p50/p95/p99 by source;
- SLO breach rate by source;
- adaptive learner-model end-to-end latency and DB calls;
- full-replay-unavailable rate.

No dashboard dimension may use learner identity or raw learner content.

## Release/load proof

H3.4 release evidence must cover:

1. exact telemetry field-set/privacy tests;
2. deterministic SLO-classification tests;
3. existing H3.3 full-replay/checkpoint parity tests;
4. long-history replay cases above the old 500-row boundary;
5. DB-call-count regression checks around checkpoint and full-replay paths;
6. browser/golden/Vercel exact-head gates;
7. production canary review of source/fallback/SLO distributions before tightening budgets.

## Next H3.4 slice

After the hot-path telemetry baseline is green, extend the same closed-field observability contract to learning-flow counters that are explicitly called out by the roadmap:

- evidence admission/rejection reason counts;
- duplicate-evidence/false-mastery guard counts;
- assessment-bank exhaustion;
- prerequisite/transfer graph unavailable;
- retention due/completion.

Those counters must use enumerated reason/state codes only and must not expose concept IDs, item IDs or learner-scoped values as metric dimensions.
