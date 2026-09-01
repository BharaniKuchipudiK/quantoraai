# Quantora Study — Core Pillar Standardization Roadmap

**Status:** Execution companion to `study-learning-intelligence-architecture.md`  
**Effective from:** 2026-09-01  
**Baseline:** merged Study V7 + PR #431 production constraint-drift repair  

## 1. Why this roadmap exists

Study has advanced unevenly. The governed learning-intelligence spine is already sophisticated, while several surrounding pillars — content depth, product UX, ingestion, observability and scale mechanics — are not yet at the same standard.

The next objective is therefore not "add more AI features". It is:

> **Bring every core Study pillar to the same production-grade standard without weakening the learner-truth architecture already built.**

A new capability does not compensate for a weak adjacent pillar. Study is ready to scale only when the whole system is balanced.

This document supplements the canonical Phases A–G. Where an old feature roadmap conflicts with the canonical architecture, the canonical architecture and this standardization roadmap win.

---

## 2. Common maturity scale

Every pillar is measured on one scale so progress is comparable.

| Level | Meaning |
| --- | --- |
| **0 — Experimental** | Prototype or prompt behavior; no dependable contract. |
| **1 — Functional** | Works for the happy path but has material correctness, security, scale or UX gaps. |
| **2 — Governed** | Explicit contract, bounded behavior, tests and fail-safe rules exist. |
| **3 — Production-grade** | Reliable under realistic load/failure, observable, secure, maintainable and release-gated. |
| **4 — Scalable / differentiated** | Proven at breadth/scale and materially strengthens Quantora's learning advantage. |

### Portfolio rule

- No core pillar may remain below **Level 3** when Study is declared broadly production-ready.
- A Level 4 learning engine does not excuse Level 1 content, UX, security or ingestion.
- New architecture phases should normally pause when they would widen an existing maturity imbalance.

---

## 3. Current pillar assessment

| Core pillar | Current level | Target | Main gap to close |
| --- | ---: | ---: | --- |
| Architecture cohesion / one learner truth | **3.5** | 4 | Finish consolidation around common server/data boundaries; prevent parallel learner-state paths. |
| Evidence integrity / mastery correctness | **3.5** | 4 | Broaden governed evidence types/content while preserving receipt-backed and delayed/transfer semantics. |
| Security / privacy / secret boundaries | **3** | 4 | Sanitize all learner-scoped logging; complete secret/history/bundle scans; least-privilege review. |
| Performance / scalability | **2.5** | 4 | Batch candidate/evidence reads; introduce durable projections/snapshots; load-test graph paths. |
| UI / UX / monochrome design system | **2** | 4 | Finish Phase B; reduce action clutter; restore progressive disclosure and conversation dominance. |
| Assessment corpus / educational content quality | **1.5** | 4 | Move from tiny static reviewed bank to governed curriculum-scale item pipeline and coverage metrics. |
| Learner graph / persistence | **3** | 4 | Formalize projection/snapshot lifecycle, replay, long-history strategy and cross-tool consumption. |
| Model routing / cost / resilience | **3** | 4 | Outcome-based routing evaluation, spend ceilings, provider failure evidence and Study-specific SLOs. |
| Observability / telemetry | **2** | 4 | Add privacy-safe learning-flow metrics, trace IDs, evidence rejection reasons and latency/error SLOs. |
| Testing / release engineering | **3** | 4 | Focused auto-discovery, migration parity gates, browser/E2E retention-transfer checks, production canaries. |
| Ingestion / media / PDF provenance | **1.5** | 4 | Secure PDF/image pipeline, page anchors, metadata stripping, prompt-injection isolation and provenance. |
| Documentation / code hygiene | **2.5** | 4 | Reconcile old P0–P6 references, remove superseded implementation guidance, maintain orphan/wiring ratchet. |
| Accessibility / learner dignity | **2.5** | 4 | Complete keyboard/reduced-motion/screen-reader gates across all new Study surfaces. |

These scores are directional engineering-planning values, not product claims. They should be updated only when exit gates are demonstrably met.

---

## 4. Pillar standards and exit gates

### Pillar 1 — Architecture Cohesion

**Standard:** one authoritative learner truth, one evidence admission boundary, one next-move planner family, and bounded server-side data access.

Must improve / fix:

- consolidate duplicate Study-only Supabase transport/config/error handling in controlled steps;
- prohibit feature-local mastery stores or feature-specific confidence truth;
- keep old `study-mastery-intelligence` / `study-learning-map` paths retired; do not resurrect superseded parallel intelligence;
- document ownership for canonical concept graph, evidence ledger, learner projection and planner;
- require version strategy for every state-model/schema change.

**Exit gate:** architecture review can trace every learner-state mutation from authoritative observation → evidence admission → projection → planner with no alternative write path.

---

### Pillar 2 — Evidence Integrity and Mastery Correctness

**Standard:** learner claims are evidence-backed, replayable and conservative. False mastery is a severe defect.

Must improve / fix:

- preserve server-owned answer keys and grading receipts;
- maintain learner-global item/version independence;
- preserve delayed retention semantics — immediate repetition is never retention;
- preserve governed transfer semantics — target must be distinct and graph-authorized;
- add deterministic verification for future evidence types before admitting them;
- track evidence diversity, not only correctness count;
- maintain review/version provenance for every mastery-contributing item.

**Exit gate:** no browser field, model prose, self-report or unreviewed item can independently promote verified understanding.

---

### Pillar 3 — Security, Privacy and Secret Boundaries

**Standard:** Study must be safe to operate with real learner data and server-owned credentials.

Must improve / fix:

- never log learner-scoped REST paths, request bodies, session tokens, answer keys or service-role credentials;
- log bounded operation/status/error class plus correlation ID only;
- keep service-role usage server-only and reject public-prefixed secret variables;
- run repository + git-history secret scans and built-client bundle checks;
- review CORS/origin/authz for every Study endpoint;
- apply least privilege to future external integrations;
- define retention/deletion policy for learner evidence and imported documents.

**Exit gate:** automated secret/privacy gates pass and an endpoint review finds no credential or learner-sensitive information exposed to browser payloads/logs beyond the documented contract.

---

### Pillar 4 — Performance and Scalability

**Standard:** correctness must not depend on increasingly expensive learner-history or assessment-bank scans.

Must improve / fix:

- batch candidate freshness reads instead of one request per item;
- batch transfer-target/evidence eligibility reads before curriculum-scale rollout;
- keep prerequisite traversal hard-bounded and DAG-safe;
- replace repeated long-history reconstruction with durable projection/snapshot strategy;
- define query/index budgets for learner graph, assessment attempts and evidence ledger;
- load-test hot paths with realistic item-bank sizes and multi-year learner history;
- add request/DB-call budgets to regression tests where practical.

**Exit gate:** p95 Study planning/assessment latency and DB-call counts remain within agreed SLOs at target corpus/history sizes without weakening fail-closed behavior.

---

### Pillar 5 — UI / UX / Monochrome Design System

**Standard:** Study feels like one calm private tutor, not a dashboard of AI features.

Must improve / fix:

- complete canonical Phase B black/white component/token migration;
- restore three-primary-action / progressive-disclosure philosophy where current shell has drifted;
- keep conversation as the dominant surface;
- expose learner state subtly and humanly rather than through fake-precision dashboards;
- use semantic reinforcement only for meaningful learning events;
- remove duplicated/competing controls;
- ensure responsive, keyboard, screen-reader and reduced-motion behavior.

**Exit gate:** Study browser/screenshot/accessibility gates pass with no legacy accent palette in migrated surfaces and no always-visible feature clutter that competes with the lesson.

---

### Pillar 6 — Assessment Corpus and Educational Content Quality

**Standard:** the governed evidence architecture must have enough reviewed content to exercise it honestly across the target curriculum.

Must improve / fix:

- replace the tiny hard-coded item bank as the long-term authoring/storage model;
- build reviewed/versioned item workflow with author → reviewer → release states;
- map each item to canonical concept, objective, difficulty, cognitive operation and misconception metadata;
- maintain multiple independent items per concept and evidence purpose;
- establish JEE/NEET curriculum coverage metrics before claiming exam readiness;
- add item-quality analytics: distractor performance, discrimination, ambiguity/rejection rate;
- support QTI-compatible import/export concepts where practical;
- never auto-promote LLM-generated candidates to verified evidence.

**Exit gate:** target curriculum coverage and independent-evidence depth meet explicit thresholds, and bank exhaustion is exceptional rather than normal for supported topics.

---

### Pillar 7 — Learner Graph and Persistence

**Standard:** learner intelligence is durable, versioned, explainable and shared across Study capabilities.

Must improve / fix:

- formalize event-ledger → projection/snapshot → planner lifecycle;
- avoid arbitrary history caps silently changing learner truth;
- support deterministic replay after model upgrades;
- expose retention schedule, unresolved misconception and next move consistently across Tutor/Quiz/Practice/Flashcards;
- define projection version/migration behavior;
- keep self-report/profile data separate from verified learner state.

**Exit gate:** replaying the same admitted ledger under the same model version reproduces the same learner graph, and all Study capabilities consume that projection rather than parallel local state.

---

### Pillar 8 — Model Routing, Cost and Resilience

**Standard:** model selection is capability-aware, evidence-informed, bounded by spend policy and resilient to provider failure.

Must improve / fix:

- keep Study routing as a reorder of authorized model rungs, never an uncontrolled provider bypass;
- measure route quality by learner outcome/verification tasks rather than model-name reputation;
- maintain explicit fallback behavior and timeout budgets;
- retain cheaper workhorse preference for ordinary Study turns where quality is adequate;
- create Study-specific provider reliability/latency/quality telemetry;
- define paid-route ceilings and degraded-mode behavior.

**Exit gate:** routing decisions are reproducible from allowed models + capability + observed quality, and provider failure cannot create uncontrolled spend or silently weaken evidence rules.

---

### Pillar 9 — Observability and Telemetry

**Standard:** production behavior can be explained without logging sensitive learner payloads.

Must improve / fix:

- correlation IDs across request → assessment → evidence → projection → planner;
- structured safe operation/status/error-class logs;
- metrics for evidence admitted/rejected and reason codes;
- assessment-bank exhaustion rate;
- prerequisite/transfer graph-unavailable rate;
- retention due/completion rates;
- latency and DB-call metrics per Study operation;
- false-mastery/duplicate-evidence guard telemetry;
- privacy-safe canary dashboards.

**Exit gate:** an incident can be diagnosed from structured telemetry without needing raw learner prompts, query strings, answer keys or secrets.

---

### Pillar 10 — Testing and Release Engineering

**Standard:** every correctness/security contract has an automated gate and migrations are proven against production schema reality.

Must improve / fix:

- auto-discover focused Study TypeScript tests rather than maintain manual test lists;
- test privacy-safe logging explicitly;
- test batched freshness while preserving exact item/version independence;
- add migration parity/drift checks for Study tables, constraints, functions and indexes;
- retain verified-learning-loop integration tests;
- add end-to-end delayed-retention and governed-transfer browser/API tests;
- add failure-mode tests for Supabase unavailable/timeout/partial rollout;
- require build, type, wiring, secret and browser gates before merge.

**Exit gate:** CI proves the behavioral contract and production canary proves schema/runtime compatibility before broad rollout.

---

### Pillar 11 — Ingestion, Media and PDF Provenance

**Standard:** learner materials can enter Study without becoming a security boundary bypass or unverifiable context blob.

Must improve / fix:

- validate file type by content/magic bytes;
- enforce byte, image-dimension and PDF-page limits;
- decode/re-encode images and strip unsafe metadata/EXIF where appropriate;
- extract PDFs with page-level provenance anchors;
- distinguish extracted text, OCR/inferred text and model interpretation;
- isolate imported text from hidden/system instructions;
- preserve source/page references into Tutor context;
- define deletion/lifecycle policy for uploads;
- add Google Classroom/Microsoft/QTI/LTI only after native ingestion and learner truth are stable.

**Exit gate:** every imported statement presented as source-backed can be traced to its source/page, and malicious imported instructions cannot alter trusted system behavior.

---

### Pillar 12 — Documentation and Code Hygiene

**Standard:** roadmap, code and tests describe the same architecture.

Must improve / fix:

- mark old P0–P6 guidance as historical where superseded by Phases A–G/V1–V7;
- remove stale references that imply deleted orphan modules should be rewired;
- keep the repository wiring ratchet at or below its current baseline;
- delete truly dead Study code instead of maintaining compatibility shims indefinitely;
- document rollout/fallback semantics beside migration-sensitive code;
- update roadmap status after every material Study PR.

**Exit gate:** a new engineer can identify the authoritative architecture, active implementation and remaining phases without reconciling contradictory roadmaps manually.

---

### Pillar 13 — Accessibility and Learner Dignity

**Standard:** accessibility is a release criterion and wrong answers never become punitive UX.

Must improve / fix:

- full keyboard path through Study controls and assessments;
- visible non-color-only focus/correctness/warning states;
- screen-reader descriptions for meaningful teaching visuals;
- reduced-motion compliance for reinforcement;
- age-appropriate and non-shaming feedback;
- do not expose internal misconception labels unnecessarily.

**Exit gate:** accessibility regression suite passes across the Study proving wave and all learning-state semantics remain understandable without color or motion.

---

## 5. Reconciled execution sequence

The canonical Phases A–G remain the product architecture. The following engineering waves close the maturity imbalance around them.

### Wave H0 — Hardening and Hygiene — **NOW**

Purpose: protect the V6/V7 foundation before expanding it.

- sanitize Study server logs;
- batch assessment freshness reads;
- introduce common safe Study Supabase transport and migrate high-risk V7 boundaries first;
- auto-discover focused Study tests;
- reconcile roadmap/orphan guidance;
- run schema/build/type/wiring/security gates.

**H0 exit:** no known Study learner-path logging leak, no per-item freshness N+1, focused Study tests self-register, and no new wiring/orphan regression.

### Wave H1 — Phase B + Phase C Closure

Purpose: bring learner-facing quality to the same standard as learning intelligence.

- monochrome tokens/components;
- three-primary-action progressive disclosure;
- onboarding/cold-start profile;
- semantic reinforcement;
- accessibility gates.

### Wave H2 — Assessment Corpus + Diagnostic Breadth

Purpose: make D/F usable across real curriculum breadth.

- governed content pipeline;
- curriculum/objective mapping;
- multiple independent evidence items per supported concept;
- JEE/NEET coverage dashboards;
- item quality/review analytics.

### Wave H3 — Persistent Scale + Observability

Purpose: make E/F efficient and operationally explainable at long-term learner scale.

- learner projection/snapshot architecture;
- batched transfer/evidence reads;
- production SLOs;
- privacy-safe traces/metrics;
- load and replay testing.

### Wave H4 — Phase G Native Ingestion

Purpose: connect Study to the learner's materials safely.

- image/PDF/notes ingestion;
- page/source provenance;
- prompt-injection isolation;
- lifecycle/deletion policy;
- only then external education integrations.

### Wave H5 — External Education Ecosystem

Purpose: expand the learning graph beyond Quantora while preserving Quantora evidence rules.

Order remains:

1. Google Classroom
2. Microsoft Education
3. QTI import/export
4. LTI Advantage
5. OneRoster / CASE
6. Caliper interoperability

---

## 6. Immediate PR sequence after #431

### PR H0.1 — Study hardening baseline

- safe Study Supabase transport;
- learner-path log sanitization;
- batched assessment-item freshness;
- focused Study test auto-discovery;
- this cross-pillar roadmap.

### PR H0.2 — Study data-access consolidation

- migrate prerequisite, transfer and evidence-loader REST helpers onto the common Study transport;
- preserve each module's fail-closed semantics;
- batch transfer eligibility reads where behavior can remain exact;
- add DB-call-count regression tests.

### PR H0.3 — V7 production proof

- migration/schema parity checks;
- retention/transfer end-to-end smoke/canary;
- production constraint/function/index verification;
- rollback/fallback documentation.

### PR H1.1 onward — Phase B/C product closure

No additional V8-style learner-state capability should start before H0 is closed unless it fixes a correctness defect.

---

## 7. Definition of Study production readiness

Study is not broadly production-ready merely because the tutor answers well.

It is ready when all of the following are simultaneously true:

- learner truth is singular and evidence-backed;
- assessment content has sufficient governed breadth;
- security/privacy gates pass;
- p95 performance meets SLO under realistic learner/corpus scale;
- learner history remains durable and replayable;
- UX is calm, accessible and coherent;
- model routing is bounded and observable;
- ingestion preserves provenance and cannot inject hidden instructions;
- CI and production canaries prove schema/runtime parity;
- there is no material Study-specific orphan/dead implementation or contradictory active roadmap.

That balanced standard — not feature count — is the completion criterion.
