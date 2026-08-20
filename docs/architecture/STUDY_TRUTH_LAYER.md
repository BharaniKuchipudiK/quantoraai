# Study Truth Layer v1

Study Truth Layer is the durable educational truth foundation behind PCL Advisor Intelligence.

## Core separation

Quantora keeps three concerns independent:

1. **Knowledge truth** — canonical concepts and dependency relationships.
2. **Curriculum truth** — versioned overlays that map canonical concepts to an authority, jurisdiction, stage and assessment depth.
3. **Learner truth** — private, append-only evidence events plus recomputable mastery estimates.

This prevents a curriculum change from rewriting the concept graph and prevents an estimator/model upgrade from rewriting learner history.

## Universal concept graph

A concept has a stable `canonicalId` and a versioned definition. Supported relationship types begin with:

- `prerequisite_of`
- `part_of`
- `application_of`
- `commonly_confused_with`
- `supports_transfer_to`

For `prerequisite_of`, direction is explicit: prerequisite -> dependent concept.

Runtime validation rejects dangling references, self-edges, duplicates and prerequisite cycles before a graph is trusted.

No curriculum names are hard-coded into the core graph. Singapore MOE, CBSE, JEE, NEET or future frameworks are data/configured overlays, not new brains.

## Curriculum overlays

A curriculum record carries jurisdiction, authority, version, effective dates and authoritative source reference. A mapping links that curriculum version to a canonical concept with optional objective code, stage, depth and exam weight.

The same canonical concept may therefore serve many curricula at different required depths without duplicating the underlying knowledge.

## Mastery evidence ledger

`study_mastery_events` is the learner source of truth. V1 stores bounded structured signals only:

- correctness or bounded score
- evidence kind (retrieval, application, transfer, teach-back, retention, etc.)
- difficulty
- hints used
- response time
- self-confidence
- independent/supported attempt
- misconception signal
- delayed-retrieval interval
- provenance and source/assessment/item references
- observation time

It deliberately does **not** store hidden model reasoning or arbitrary free-form answer text in the mastery ledger.

## Interpretable estimator v1

The first estimator is transparent and replaceable. It uses a bounded Bayesian-style weighted evidence update:

- independent work weighs more than supported work
- hints reduce evidence weight
- correct difficult evidence is more diagnostic than correct easy evidence
- incorrect easy evidence is more diagnostic than incorrect hard evidence
- transfer and delayed retrieval carry stronger evidence than a single routine item
- self-confidence alone never becomes mastery evidence
- confidently wrong evidence raises a separate misconception-risk signal
- delayed retrieval creates a distinct retention estimate
- recency influences weight without deleting older evidence

No scored evidence returns `insufficient_evidence` and `mastery: null` — never an invented zero or percentage.

Estimates are marked `provisional` until enough weighted/diverse evidence exists; the estimator version and reason codes are stored so results can be recomputed and audited.

## Advisor bridge

Derived mastery estimates feed the existing Study Advisor adapter. Insufficient estimates are intentionally omitted; PCL Advisor Intelligence therefore sees an evidence gap and recommends a short diagnostic rather than hallucinating weakness.

The loop remains:

`Understand -> Diagnose -> Advise -> Act -> Verify -> Learn`

Example:

`Trigonometric component interpretation -> Vector decomposition -> Projectile motion`

If Projectile Motion and Vectors are weak but Trigonometry has no trustworthy evidence, Quantora first recommends a targeted Trigonometry diagnostic. If Trigonometry is then confirmed weak, it becomes the bottom-up repair target before climbing back through Vectors to Projectile Motion.

## Persistence and privacy

Migration `0022_study_truth_layer.sql` adds:

- `study_concepts`
- `study_concept_edges`
- `study_curricula`
- `study_curriculum_mappings`
- `study_mastery_events`
- `study_mastery_estimates`

All tables are server-managed in v1. RLS is enabled as defense in depth; `anon` and `authenticated` receive no table privileges. Learner rows are owned by the verified server-side `user_sub`; browser-provided ownership is never trusted.

Raw events remain durable truth. Estimates remain replaceable derived state.

## What v1 intentionally does not do

- no bulk curriculum ingestion yet
- no proprietary question-bank scraping
- no opaque neural mastery score
- no hidden second memory store
- no student-facing autonomous action
- no model/provider lock-in

## Next

1. ingest a small authoritative curriculum pilot with provenance
2. add server repository adapters for graph/evidence reads and writes
3. calibrate item difficulty and evidence weights with real data
4. add source intelligence for YouTube/audio/PDF/notes
5. add spaced retrieval scheduling and exam-readiness strategy
6. benchmark Gemini/LearnLM, Claude and other tutor runtimes on measurable learning gain

Core rule:

**Knowledge is versioned. Evidence is preserved. Mastery is recomputed. Advice is earned from proof.**
