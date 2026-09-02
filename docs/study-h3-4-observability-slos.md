# Study H3.4 — Privacy-safe Observability and SLOs

**Status:** implementation complete pending final PR validation  
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
- SLO classification;
- closed learning-flow metric/outcome/evidence-kind categories.

It must not contain:

- `user_sub`, learner/session identifiers or hashes derived from them;
- concept IDs, item refs or assessment refs as metric dimensions;
- prompts, answers, answer keys, misconception prose or learner messages;
- REST paths, query strings or request/response bodies;
- assessment receipts/item payloads;
- service-role credentials, provider keys or raw exception messages.

There is intentionally no arbitrary metadata bag in either telemetry API.

## Correlation model

`loadStudyLearnerModel()` establishes one server-owned async telemetry scope. Active-concept reconstruction and any prerequisite traversal remain under that same random trace ID. Governed assessment issue/grade database operations establish the same kind of server-owned assessment scope. The common Study Supabase transport increments the active scope DB-call counter for every actual REST request.

Projection-load events distinguish:

- checkpoint + bounded delta success;
- authoritative full replay;
- checkpoint miss/unavailable;
- delta unavailable/overflow;
- checkpoint replay rejection, including unsafe backdated semantic ordering;
- full replay unavailable.

## Initial production SLO targets

These are H3.4 engineering targets, not learner-facing product claims. They are versioned in `study-slos.ts` and must be revised from privacy-safe production distributions, not silently loosened after regressions.

| Projection path | p95 latency target | DB-call budget |
| --- | ---: | ---: |
| checkpoint + bounded delta | <= 750 ms | <= 6 |
| authoritative full replay | <= 2,000 ms | <= 12 |

SLO classification is observational. A breach is reported but does not cause a learner request to fail or switch to a less-correct path.

## Learning-flow operational counters

The second H3.4 slice adds closed categorical counters at authoritative decision points rather than inferring behavior from UI text:

- assessment availability: issued, no released item, bank exhausted, misconception confirmation unavailable;
- evidence guard: successful governed grade, duplicate evidence blocked, issuance freshness race;
- prerequisite graph unavailable after the evidence-backed planner;
- retention: due, not due, and supported/completed states.

The pure evidence admission/replay functions intentionally remain side-effect free. Replaying a ledger must not emit a second copy of live operational events.

## Required operational distributions

Production dashboards/log aggregation should compute, at minimum:

- projection source ratio: checkpoint/delta vs full replay;
- fallback reason rate;
- projection latency p50/p95/p99 by source;
- DB calls per projection p50/p95/p99 by source;
- SLO breach rate by source;
- adaptive learner-model end-to-end latency and DB calls;
- full-replay-unavailable rate;
- assessment-bank exhaustion rate;
- evidence duplicate/freshness-guard rate;
- prerequisite graph-unavailable rate;
- retention due/completion counts.

No dashboard dimension may use learner identity or raw learner content.

## Release/load proof

H3.4 release evidence covers:

1. exact telemetry field-set/privacy tests;
2. deterministic SLO-classification tests;
3. existing H3.3 full-replay/checkpoint parity tests;
4. long-history replay cases above the old 500-row boundary;
5. a deterministic 5,000-event fold test proving compact replay state;
6. a 4,500-event checkpoint plus the maximum 500-row delta producing exactly the same mastery/learner fold state as the 5,000-event full fold;
7. DB-call-count regression instrumentation around projection/assessment server scopes;
8. browser/golden/Vercel exact-head gates;
9. production canary review of source/fallback/SLO distributions before tightening budgets.

Wall-clock microbenchmarks are deliberately not release gates because shared CI runners make them noisy. Actual production latency is measured continuously by the versioned SLO telemetry.

## H3 exit position

With H3.1–H3.4 complete, Study has:

- deterministic authoritative replay;
- durable derived snapshots/checkpoints;
- bounded keyset delta replay with full-replay parity and safe fallback;
- no silent long-history truncation;
- privacy-safe correlation, replay/fallback telemetry and real DB-call accounting;
- versioned latency/DB-call SLOs;
- operational counters for the highest-value learning-flow guards;
- deterministic multi-year replay/load proof at the current 5,000-row safety ceiling.

The next roadmap wave is H4 native ingestion. Before beginning H4 implementation, conduct the requested architecture/product study of what H0–H3 capabilities mean to learners, operators and the Quantora product as a whole.
