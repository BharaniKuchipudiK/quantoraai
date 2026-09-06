# Study Tutor — 5/5 Roadmap

**Design checkpoint:** 2026-09-07  
**North star:** `Understand → Diagnose → Teach → Observe → Verify → Adapt → Retain → Transfer`

Study Tutor is no longer a generic tutoring chat. The architecture now has governed learner evidence, a learner model, misconception/retention/transfer state, a teaching-representation planner, native subject renderers, one-action pacing and browser release gates. The next maturity step is semantic grounding: resolve the learner's active concept once, construct one transient Active Learning Context, and make every downstream teaching decision consume that resolved context rather than re-reading free text independently.

## 1. Current phase assessment

| Phase | Status | What is already true |
|---|---|---|
| H3.5.0 — Architecture lock | ✅ Complete | One authoritative learner truth, typed representation decisions, fail-closed renderer rules and no-fake-visual policy are established. |
| H3.5.1 — Representation planner foundation | ✅ Complete | Teaching Representation Planner is typed/versioned and sits in the governed Study route. |
| H3.5.2 — Electricity proving vertical | ✅ Complete | Electricity/EMF has a first-class native renderer and release proof. |
| H3.5.3 — Learner-state adaptation | ✅ Complete | Verified learner state materially changes the next representation without creating a second learner store. |
| H3.5.4 — Physics + Math breadth | ✅ Complete for the planned proving breadth | Vectors/components, motion graphs, fields, quadrant/trig, algebra transformations and Pythagoras/geometry have native representation coverage. |
| H3.5.5 — Experience release gates | 🟡 Substantially complete | Visual compliance, one-idea pacing, accessibility, fallback and cross-workspace isolation are release-gated. The no-second-truth evidence gate remains an open closeout item (#537 at this checkpoint). |

**Interpretation:** five H3.5 phases are complete; the sixth is substantially built but should not be declared closed until its remaining exit gate is merged and the semantic/visual defects captured below are closed. H4 native ingestion should remain downstream of that closeout.

## 2. What the screenshots exposed

### Screenshot 1 — weekly study-plan request receives a free-body diagram

The learner asked for a schedule, not a Mechanics lesson. The server-side Study route already has a governed representation planner, but the client `StudyMarkdown` layer was independently re-inferring the active subject from conversation text and could call `ensureStudyTeachingVisual()`. An older Mechanics turn therefore remained eligible to manufacture a free-body diagram even when the current turn was meta-learning.

**Root cause:** two representation authorities existed in practice:

1. server: Teaching Representation Planner;
2. client: generated-prose/topic scan → automatic picture injection.

That violates the intended architecture. A renderer must render a decision; it must not make a new semantic teaching decision.

### Screenshot 2 — gap analysis receives the same stale free-body diagram

A progress/gap review is about the learner model and learning trajectory. It is not permission to reteach the last subject with a stock visual. The same duplicate client inference path allowed stale Mechanics context to leak into the progress-review turn.

**Required behavior:** `meta_planning` and `progress_review` are explicit Active Learning Context modes. They fail closed to text/structured learning advice unless the user asks for a representation that is genuinely appropriate to the meta task.

### Screenshot 3 — “Newton's third law with an animation” becomes prose frames

The platform already has a native `StudyVisualLab` and uses `requestAnimationFrame` for interactive Mechanics behavior, but animation was not a first-class requested representation. The planner recognized visual/graph/story/example modes, not animation, and Newton's third-law tab was static prose.

**Required behavior:** animation/simulation is a governed representation class, not a video promise. For Newton's third law the native proving vertical is an accessible two-body push-apart interaction showing simultaneous equal-and-opposite forces, with a reduced-motion equivalent.

## 3. Architecture evolution: Canonical Active Learning Context

The architecture should evolve to:

```text
Learner request / Study context
        ↓
Canonical concept resolution — once
        ↓
Active Learning Context (transient, typed, no persistence)
        ├─ concept id/key/label + resolution confidence
        ├─ curriculum/objective context
        ├─ verified learner state
        ├─ current intent / pedagogical mode
        ├─ explicit representation request
        └─ available representation capability
        ↓
Teaching Representation Planner
        ↓
Adaptive Lesson Loop
        ↓
Renderer / Assessment / Model
        ↓
One learner action
        ↓
Governed evidence admission
        ↓
Authoritative Learner Graph
```

### Non-negotiable boundary

The Active Learning Context is **not** a second learner model, database, memory system or orchestrator. It is a pure per-turn projection of existing authoritative state. The learner graph/evidence ledger remains the only source of learner truth.

### Semantic rule

`free text → canonical concept resolution once → Active Learning Context → downstream consumers`

Free-text/regex/LLM matching remains useful for discovery, bootstrap and fail-closed fallback. It must not be the repeated primary semantic control plane across thousands of JEE/NEET/CBSE concepts.

## 4. H3.6 — Semantic Grounding & Interactive Teaching

H3.6 is the recommended bridge between H3.5 closeout and H4 ingestion. It strengthens the existing architecture rather than replacing it.

### H3.6.0 — Active Learning Context lock

**This PR starts this slice.**

- introduce the typed transient Active Learning Context;
- classify concept teaching vs meta-planning vs progress review vs assessment vs continuation;
- prefer canonical concept identity already present in the authoritative learner model;
- pass the same resolved context into the Teaching Representation Planner;
- forbid downstream presentation code from manufacturing a new subject representation from generated prose;
- add regression tests for the two screenshot failures.

**Exit:** planning/gap-review turns cannot inherit a stale subject visual, and downstream representation planning has one semantic input object.

### H3.6.1 — Canonical resolution on every Study turn

The current learner-model path resolves a canonical concept when a valid Study `conceptKey/conceptLabel` is available and memory-backed learner state is being loaded. That is not yet enough for 5/5 semantic grounding.

Build a dedicated resolution seam that is available to every Study turn, independent of whether persistent learner memory is enabled:

- resolve exact active concept against `study_concepts` once;
- return `conceptId`, `canonicalKey`, label, subject, curriculum mappings and confidence/ambiguity;
- preserve the existing learner model as the state authority;
- never silently pick between multiple plausible canonical concepts;
- unknown/ambiguous concepts remain unresolved and fail closed;
- session/free-text concept labels are discovery inputs, not canonical truth.

**Important:** Newton's Third Law does not yet have a canonical Mechanics concept node in the current pilot graph. Do not fabricate a `physics.mechanics.*` key. Add the real concept through governed curriculum expansion before treating it as canonical.

### H3.6.2 — Capability metadata moves from word matching to concept metadata

The first Active Learning Context slice can map known canonical-key families to renderer capabilities while keeping text matching as fallback. The 5/5 endpoint should make capability availability explicit metadata associated with canonical concepts/concept families.

Target:

```text
concept id
  → subject/concept family
  → supported representation capability ids
  → renderer kind/version
  → accessibility equivalent
  → fallback policy
```

Regex should answer “can I discover a likely concept?” — not “what renderer is authoritative after the concept is known?”

### H3.6.3 — Native animation/simulation contract

**This PR starts the proving vertical with Newton's Third Law.**

Define animation as a governed representation capability:

- explicit request mode: `animation`;
- representation: `simulation_or_lab`;
- renderer capability: native Study lab only when supported;
- no claim that a video was streamed;
- deterministic subject-correct interaction;
- keyboard-operable controls;
- `prefers-reduced-motion` equivalent;
- text equivalent describing the instructional relationship;
- interaction/view events never become mastery evidence.

After the Newton proving vertical, generalize the contract for high-value concepts where motion actually teaches the idea: projectile motion, field direction, wave propagation, graph transformations, molecular/process dynamics and similar cases. Do not animate decorative content.

### H3.6.4 — Real closed-loop adaptive journey

The current browser representation gate is strong for renderer contracts, but much of it uses synthetic `/api/chat` replies. Add one gold-standard closed-loop journey that proves the actual learning engine:

```text
stored admitted evidence
→ learner graph
→ nextLearningMove
→ canonical Active Learning Context
→ representation planner
→ model/native renderer
→ learner response
→ admitted evidence
→ learner graph changes
→ next representation changes
```

Electricity remains the best first closed-loop reference vertical because H3.5 already established it as the gold-standard representation proving case.

### H3.6.5 — Semantic and modality release gates

Add release proofs for:

- no stale-concept visual on study planning;
- no stale-concept visual on progress/gap review;
- canonical concept beats transcript keyword collision;
- ambiguous concept fails closed;
- explicit supported animation renders a native interaction;
- unsupported animation admits no fake UI claim;
- reduced-motion equivalent;
- animation/view telemetry cannot alter mastery;
- cross-workspace isolation;
- representation decision contains no sensitive learner payload.

## 5. Then H4 — Native source ingestion

Only after H3.5/H3.6 semantic control is stable should native Study ingestion feed it.

Do not create a second parser stack. Promote/reuse the existing Research document primitives:

- `api/_lib/research-pdf-text.ts`
- `api/_lib/research-source-fetch.ts`

Target flow:

```text
secure source ingest + provenance
→ structured document
→ concepts / figures / worked examples
→ canonical concept resolution
→ learner-graph comparison
→ Active Learning Context
→ Teaching Representation Planner
```

Avoid `PDF → giant LLM summary`. Source content should strengthen concept grounding and teaching evidence, not bypass it.

## 6. Curriculum/content depth after the control plane

A 5/5 product cannot stop at a technically elegant pilot graph. Expand reviewed curriculum coverage deliberately:

- Mechanics: Newton's laws, force systems, momentum, work/energy/power, circular motion;
- Electricity & Magnetism depth;
- waves/optics/thermal physics;
- Mathematics across algebra, coordinate geometry, calculus, probability/statistics, vectors/3D;
- Chemistry and Biology representation families where they genuinely add learning value;
- governed mappings for CBSE/JEE/NEET and additional target curricula;
- reviewed misconception probes, retrieval/retention checks, application and transfer tasks;
- source-grounded worked examples and figure provenance.

H2.3 corpus/academic review remains important here: architecture cannot compensate for shallow or unreviewed learning content.

## 7. Definition of “5/5”

Study Tutor earns 5/5 only when all five dimensions are strong together:

### 1. Semantic correctness — 5/5
- exact active concept is resolved once and propagated;
- downstream planners/renderers do not re-guess the concept;
- ambiguity fails closed;
- curriculum/objective mapping is explicit and sourceable.

### 2. Adaptive learning intelligence — 5/5
- verified evidence drives misconception repair, prerequisite repair, retention and transfer;
- conversation confidence/preferences affect teaching style but never masquerade as mastery;
- next action is explainable from learner state.

### 3. Representation/modality quality — 5/5
- diagrams, graphs, worked examples, comparisons and animations are chosen because they teach the current idea;
- no generic/decorative/stale visuals;
- explicit learner modality requests are honored when supported and fail honestly when not;
- accessibility/reduced-motion equivalents are first-class.

### 4. Closed-loop evidence — 5/5
- learner action produces governed evidence;
- evidence admission is deterministic and provenance-aware;
- the learner model demonstrably changes future teaching;
- a browser/production gate proves the entire loop, not only isolated renderers.

### 5. Curriculum/source depth & production proof — 5/5
- reviewed coverage is deep enough for target curricula/exams;
- native sources map into the same canonical graph;
- browser, exact-head CI, deployment and golden journeys protect the behavior in production;
- no second learner truth, duplicate parser, fake visual or orphan semantic router exists.

## 8. What must not change

Preserve these decisions while implementing the roadmap:

- **one authoritative learner truth**;
- evidence ledger + admission policy;
- learner graph and bounded next-learning-move policy;
- one Teaching Representation Planner;
- one Study visual rendering pipeline;
- fail-closed renderer capability/no fake visuals;
- one teaching beat → one learner action → wait when the pedagogy requires it;
- “LLM teaches; governed code owns learner truth”;
- H4 reuses shared document primitives rather than duplicating ingestion.

## 9. Recommended implementation order

1. Merge the remaining H3.5.5 no-second-truth gate (#537) after exact-head validation.
2. Land H3.6.0: Active Learning Context + remove client auto-visual authority + screenshot regressions + Newton animation proving vertical.
3. H3.6.1: canonical resolution for every Study turn; add real Mechanics/Newton concept nodes through governed curriculum work.
4. H3.6.2: capability registry/metadata keyed by canonical concepts; regex becomes discovery fallback only.
5. H3.6.3: reusable animation/simulation contract and a small set of pedagogically justified proving concepts.
6. H3.6.4: full real closed-loop Electricity adaptive journey.
7. H3.6.5: semantic/modality release gates and exit audit.
8. Resume H4 native ingestion into the same semantic control plane.
9. Expand reviewed curriculum/content breadth and corpus quality.

The goal is not to make Study Tutor produce more media. The goal is that Quantora knows **what concept the learner is actually on, what the learner has genuinely demonstrated, why the next teaching move is appropriate, and which representation is the smallest one that will move understanding forward.**
