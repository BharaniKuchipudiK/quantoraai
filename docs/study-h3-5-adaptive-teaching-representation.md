# Quantora Study — H3.5 Adaptive Teaching & Representation Engine

**Status:** Architecture lock / implementation gate  
**Effective from:** 2026-09-02  
**Base:** H3.1–H3.4 complete on `main`  
**Scope of this document:** Product + technical architecture only. No runtime behavior change.  
**Precedence:** This document inserts H3.5 between H3 Persistent Scale + Observability and H4 Native Ingestion. Where an older Study roadmap implies H4 should start immediately after H3, this H3.5 gate wins.

---

## 1. Why H3.5 exists

Quantora Study now has a comparatively mature learner-intelligence spine:

- governed evidence and verification;
- canonical concepts and prerequisite reasoning;
- misconception diagnosis and repair state;
- retention and transfer semantics;
- evidence-backed learner projection;
- deterministic replay;
- durable snapshots/checkpoints;
- bounded delta replay;
- privacy-safe observability and production SLOs.

The learner-facing teaching experience has not reached the same maturity.

A production review of Study Tutor showed a repeated failure pattern: when a learner asked for simpler teaching, storytelling, gamification, or explicitly asked to be taught with images, the response could remain predominantly prose. The wording changed, but the **instructional representation did not reliably change**.

This is a material architecture gap, not merely a prompt-tuning issue.

> Quantora already reasons increasingly well about **what the learner needs**. H3.5 makes Quantora reason explicitly and governably about **how that learner should be taught next**.

H3.5 therefore promotes representation choice from an optional model behavior into a first-class Study decision.

---

## 2. Product north star

A learner should not experience Quantora as a chatbot that rewrites the same explanation in different English.

The target experience is:

```text
Observe learner state
      ↓
Choose one learning objective
      ↓
Choose the best teaching representation
      ↓
Show / ask / let learner act
      ↓
Observe the response
      ↓
Verify / diagnose
      ↓
Adapt the next representation
```

The learner-facing loop remains:

> **Show → Ask → Wait → Diagnose → Adapt**

not:

> Explain everything → append one question → continue talking.

A strong Tutor turn should normally contain **one idea, one high-value representation, and one learner action**.

---

## 3. Architectural decision

### 3.1 Representation choice becomes server-owned Study policy

The LLM may propose wording and representation candidates. It must not be the sole authority deciding whether a learner receives text, a visual, a comparison, a worked example, or an interaction.

Introduce a bounded **Teaching Representation Planner** between learner state and response rendering.

```text
Learner Projection
+ active concept
+ prerequisite state
+ misconception state
+ retention / transfer state
+ current pedagogical objective
+ explicit learner request
+ session representation preference
+ renderer availability
            ↓
TEACHING REPRESENTATION PLANNER
            ↓
Teaching Representation Plan
            ↓
Model generation / deterministic renderer / governed assessment
            ↓
Study presentation surface
```

The planner is advisory about language but authoritative about the **allowed representation contract**.

### 3.2 Existing visual infrastructure is promoted, not discarded

Quantora already has useful Study primitives:

- `StudyMarkdown` segmented teaching content;
- `StudyPicture` subject-aware SVG rendering;
- `studyVisualKind` and active-concept visual classification;
- process-flow, timeline, number-line and graph representations;
- mechanics/free-body rendering;
- algebra balance rendering;
- biology-cell rendering;
- chemistry-bond rendering;
- narrow optics rendering;
- an embedded answer/wait interaction;
- browser gates for Study media and conversational behavior.

H3.5 must **generalize and govern these primitives**, not build a parallel visual system.

The current weakness is that visual support is narrow and often depends on the model emitting a compatible tag or on a limited fallback classifier. Electricity/electromagnetism, for example, is not currently a first-class visual family.

### 3.3 No second learner truth

Representation selection may consume learner state. It must never become learner truth itself.

- choosing a diagram does not change mastery;
- viewing a diagram does not prove understanding;
- clicking “got it” does not prove understanding;
- reading a source summary does not prove understanding;
- learner preference is context, not evidence;
- only existing admitted evidence paths may alter verified learner state.

---

## 4. Canonical representation contract

Introduce a versioned internal contract conceptually equivalent to:

```text
StudyTeachingRepresentationPlan
  schemaVersion
  conceptId?
  conceptKey?
  objective
  learnerStateReason
  requestedMode?
  primaryRepresentation
  supportingRepresentation?
  learnerAction
  maxTextDensity
  rendererRequirement
  fallbackPolicy
  accessibilityRequirement
  sourceContext?
  generatedAt
```

### 4.1 Bounded objectives

Initial objective classes should remain closed and explainable:

- `introduce_concept`
- `clarify_concept`
- `repair_prerequisite`
- `repair_misconception`
- `worked_application`
- `independent_retrieval`
- `retention_probe`
- `transfer_application`
- `compare_distinguish`
- `source_grounded_review`

### 4.2 Bounded primary representation types

H3.5 should begin with a closed representation vocabulary:

- `concise_text`
- `annotated_diagram`
- `graph`
- `process_flow`
- `comparison`
- `worked_example`
- `number_line`
- `timeline`
- `story_analogy`
- `interactive_probe`
- `governed_assessment`
- `simulation_or_lab`

This list is a product contract, not a promise that every subject has every renderer on day one.

### 4.3 Learner action types

The plan must identify what the learner does next:

- predict;
- label;
- choose;
- calculate;
- explain;
- compare;
- sketch mentally / identify relationship;
- retrieve from memory;
- correct a misconception;
- apply to a new context.

Passive reading should not become the default learner action for multi-turn tutoring.

---

## 5. Representation decision hierarchy

The planner should choose representations in this order of authority.

### Rule 1 — Explicit learner format request

An explicit request such as:

- “show me a diagram”;
- “teach me using images”;
- “use a graph”;
- “give me a worked example”;
- “explain it as a story”;

is a strong representation constraint for the current turn.

If a valid renderer exists, Quantora must honor it.

If no valid renderer exists, Quantora must fail honestly and choose the closest supported representation. It must **not silently ignore the request and return a prose wall**.

### Rule 2 — Misconception repair

A confirmed misconception should change more than wording.

Examples:

- confuse EMF with terminal voltage → comparison + annotated circuit;
- confuse velocity with acceleration → graph / vector representation;
- sign error from quadrant reasoning → coordinate/quadrant visual;
- algebra balance misconception → balance transformation rather than another definition.

### Rule 3 — Prerequisite repair

When the deepest verified gap is prerequisite knowledge, the representation must target that prerequisite rather than decorate the downstream topic.

### Rule 4 — Subject-native representation

Where a concept has a strong native visual or symbolic form, prefer it over prose when it materially reduces cognitive load.

### Rule 5 — Learner/session preference

Observed choices such as repeated requests for diagrams or worked examples may influence later representation ranking in the same session or consented profile context, but preference never overrides correctness or renderer availability.

### Rule 6 — Text as a representation, not the default escape hatch

`concise_text` is valid when text is genuinely the best representation. It must not be the automatic fallback merely because model generation is easier.

---

## 6. Text-density and pacing contract

H3.5 does not impose an arbitrary global word count. It imposes a **teaching shape**.

### Default tutor beat

1. Anchor to something concrete or previously known.
2. Present one concept or distinction.
3. Render the chosen representation.
4. Ask one question/action.
5. Stop.

### Prohibited default pattern

- multi-topic chapter summary;
- five definitions before interaction;
- long story followed by the same formula explanation;
- a diagram request answered only with metaphorical prose;
- answering the learner’s check question before allowing an attempt;
- repeating a completed question in paraphrased form without pedagogical reason.

### Compression rule

If the same instructional value can be carried by a diagram + 40 words instead of 300 words, the shorter multimodal form should win.

---

## 7. Subject-native renderer architecture

Renderer selection must be based on **concept semantics**, not generic decorative art.

### 7.1 Physics

Initial renderer families:

- mechanics / free-body forces;
- vectors and components;
- motion graphs;
- optics / ray diagrams;
- **electric circuits and potential/EMF**;
- electric field / charge relationships;
- magnetic field direction;
- electromagnetic induction;
- energy/work/power flow;
- waves where diagrammatic representation is appropriate.

### 7.2 Mathematics

Initial renderer families:

- algebra transformation/balance;
- coordinate plane and quadrants;
- function graphs;
- geometry constructions;
- trigonometric triangles/unit-circle relationships;
- number line / inequalities;
- sequence/process transformation;
- probability/tree or distribution views where appropriate.

### 7.3 Chemistry

Initial renderer families:

- atoms/bonds;
- reaction flow;
- particle-level state changes;
- periodic relationships;
- stoichiometric worked-flow representations;
- apparatus where deterministic, curriculum-safe diagrams exist.

### 7.4 Biology

Initial renderer families:

- labelled structures;
- system/process flows;
- cycles;
- comparison diagrams;
- inheritance/process representations.

### 7.5 Generic structured representations

Subject-neutral renderers remain allowed when semantically true:

- timeline;
- process flow;
- comparison;
- table/matrix;
- number line;
- graph;
- relationship map.

Generic art with no instructional payload is prohibited.

---

## 8. Gold-standard proving vertical — Electricity & Magnetism

H3.5 implementation begins with one reference vertical rather than broad shallow renderer coverage.

### 8.1 Reference concept

**EMF vs Potential Difference / Terminal Voltage**

The proving lesson must be capable of teaching this concept without depending on a long prose explanation.

### 8.2 Required representations

At minimum:

1. **Annotated circuit schematic**
   - cell/source;
   - external component/load;
   - current direction where relevant;
   - voltmeter placement when pedagogically useful;
   - internal resistance when introduced.

2. **Energy-per-coulomb flow**
   - energy supplied by source;
   - energy transferred externally;
   - internal energy loss where relevant.

3. **EMF vs potential-difference comparison**
   - source vs component/terminal relationship;
   - units and meaning;
   - no misleading “EMF is a force” implication.

4. **Annotated numerical worked example**
   Example structure:
   - source EMF;
   - terminal voltage;
   - internal drop;
   - learner predicts or calculates one missing quantity.

5. **Misconception branch**
   If the learner treats EMF and terminal voltage as identical in all conditions, the next representation must explicitly expose internal resistance / internal energy transfer.

6. **One-action pacing**
   The lesson must stop for a prediction/check instead of dumping the whole chapter.

### 8.3 Gold-standard browser scenarios

The browser gate must prove at least:

- “Teach me EMF vs potential difference” produces one focused concept beat;
- “Teach me using images” produces an actual diagrammatic representation;
- “I don’t understand” changes representation or diagnostic action rather than merely lengthening prose;
- “Make it easy” compresses and simplifies without losing correctness;
- a wrong answer triggers targeted misconception repair;
- a correct answer advances to a genuinely new application;
- completed question is not repeated without explicit retry;
- keyboard and screen-reader semantics exist for the diagram and learner action;
- reduced-motion behavior remains safe where animation is ever added.

---

## 9. Model / deterministic renderer boundary

### Model may propose

- conversational wording;
- analogy candidates;
- concise explanation;
- structured semantic parameters within a validated schema;
- which misconception phrasing may resonate with the learner.

### Deterministic / governed code must own

- allowed representation type;
- renderer availability;
- subject-family compatibility;
- visual schema validation;
- size/complexity bounds;
- answer-key ownership;
- evidence admission;
- whether a requested visual was actually rendered;
- accessibility metadata requirements;
- fallback reason codes.

The model must not be allowed to invent an unsupported UI surface and claim it exists.

---

## 10. Failure and fallback policy

H3.5 must fail in the pedagogically honest direction.

### Unsupported visual request

If the learner requests a visual but the concept has no safe renderer:

- do not fabricate a misleading diagram;
- do not claim an image was shown;
- use a supported structured alternative when useful;
- record a closed fallback reason;
- keep the explanation concise.

### Renderer mismatch

A mechanics diagram must never be reused because a generic keyword fired in an electricity lesson.

### Generation failure

If a model omits required structured output:

- deterministic policy may repair from known safe renderer templates;
- otherwise fall back with an explicit reason;
- never silently turn a required visual turn into unlimited prose.

### Ambiguous concept

If the active concept is too broad or unclear to render correctly, ask one small clarification or use a representation that is safe at the known abstraction level.

---

## 11. Accessibility and learner dignity

Every meaningful visual representation must provide:

- semantic `role`/labeling;
- concise screen-reader description of the instructional relationship;
- no information encoded by color alone;
- sufficient contrast;
- keyboard path for learner actions;
- reduced-motion compliance;
- no punitive treatment of wrong answers.

A screen-reader learner must receive the same conceptual relationship even if the SVG itself is not visually consumed.

---

## 12. Telemetry and SLO extension

H3.4 provides the privacy-safe observability substrate. H3.5 should extend it only with closed categories.

Useful metrics:

- requested representation type;
- selected representation type;
- renderer family;
- explicit-request honored / fallback;
- fallback reason;
- representation render success;
- learner action type;
- representation switch after “I don’t understand”;
- prose-only rate for concepts with an available native visual;
- visual-request-to-actual-visual success rate.

Never log:

- learner identity;
- prompt/body text;
- concept free text as an unbounded dimension;
- answer content;
- source document text;
- raw model response;
- secrets/provider payloads.

---

## 13. H4 relationship — ingestion must feed teaching, not prose generation

H4 remains necessary, but its downstream target changes.

The intended path is:

```text
PDF / image / notes / slides
        ↓
secure ingestion + provenance
        ↓
structured source document
        ↓
source-grounded concepts / figures / examples
        ↓
learner graph comparison
        ↓
Teaching Representation Planner
        ↓
source-grounded visual / worked / interactive teaching
```

H4 must not end at:

```text
PDF → extracted text → long LLM summary
```

### Existing Research PDF reuse rule

Research already contains useful PDF text-layer extraction primitives. H4 should evaluate promoting shared safe primitives for:

- PDF admission and MIME handling;
- byte/page caps;
- text-layer extraction;
- encrypted/unreadable/empty failure classes;
- fail-closed behavior.

Study must not directly couple to Research domain semantics. Shared extraction must sit behind a provider-neutral document contract with Study-specific provenance, lifecycle, authorization, figure/table and prompt-injection requirements layered above it.

### NotebookLM / external notebook rule

NotebookLM / Gemini Notebook remains an optional interoperability adapter after native Quantora Grounded Notes Intelligence is strong. Quantora must not depend on NotebookLM for source truth, learner truth, or teaching representation.

---

## 14. Implementation sequence

### H3.5.0 — Architecture lock — this document

- no product/runtime changes;
- freeze representation contract and authority boundaries;
- freeze gold-standard Electricity proving vertical;
- freeze exit gates before implementation.

### H3.5.1 — Representation planner foundation

- typed/versioned representation plan;
- explicit learner-request detection;
- bounded objective/representation vocabulary;
- deterministic fallback reasons;
- no new renderer breadth yet.

### H3.5.2 — Electricity proving vertical

- electricity/electromagnetism concept family;
- circuit renderer;
- EMF/terminal-voltage energy-flow renderer;
- comparison/worked-example rendering;
- browser proof against the reference lesson.

### H3.5.3 — Learner-state adaptation

- misconception → representation switch;
- prerequisite → foundation representation;
- retention → retrieval representation;
- transfer → new-context representation;
- explicit “I don’t understand” representation-switch contract.

### H3.5.4 — Physics + Math breadth

- vectors/components;
- richer graph contracts;
- electric/magnetic field views;
- coordinate/quadrant/trig representations;
- geometry/algebra transformation support;
- coverage/renderer availability metrics.

### H3.5.5 — Experience release gates

- visual-request compliance gate;
- text-density / one-idea behavioral gate;
- accessibility gate;
- representation fallback gate;
- cross-workspace isolation;
- full browser/release validation.

Only after H3.5 exit should H4 Native Ingestion implementation begin.

---

## 15. H3.5 exit gates

H3.5 is complete only when all of the following are demonstrably true:

1. **Explicit visual request is enforceable.** A supported concept requested “using images/diagram” produces a real supported visual, not prose-only output.
2. **One-concept pacing is release-gated.** The proving vertical does not dump a chapter before learner interaction.
3. **Representation choice is typed/versioned.** It is not hidden entirely inside model prose.
4. **Learner state changes representation.** At minimum misconception, prerequisite, retention and transfer states can select materially different teaching actions.
5. **Electricity is first-class.** EMF vs potential difference is taught through valid circuit/energy representations.
6. **No fake visuals.** Unsupported or ambiguous cases fail honestly rather than render decorative/misleading diagrams.
7. **No second learner truth.** Representation/view events cannot promote mastery.
8. **Accessibility is equivalent.** Meaningful relationships have screen-reader/keyboard-safe alternatives.
9. **Privacy-safe telemetry exists.** Operators can see representation/fallback behavior without learner text or identity.
10. **Existing Study contracts remain intact.** Verification, assessment, replay, checkpoint, retention, transfer and H3 SLO behavior do not regress.
11. **Cross-workspace isolation passes.** Finance, Travel, Research, Coding and General do not acquire Study representation behavior.
12. **Full CI/browser/Vercel/golden gates pass** on the exact merge candidate.

---

## 16. Non-goals

H3.5 is not:

- a full image-generation product;
- a generic whiteboard;
- an animation engine for every concept;
- PDF/NotebookLM ingestion;
- a new learner model;
- a replacement assessment engine;
- a second mastery store;
- an excuse to add decorative graphics;
- a broad dashboard redesign;
- H4 or H5 external ecosystem work.

---

## 17. Product completion standard

The H3.5 north-star test is simple:

> **If Quantora knows something meaningful about how this learner is stuck, can the learner actually feel that knowledge in the way Quantora teaches the very next idea?**

Before H3.5, the answer can still be “the text changes.”

After H3.5, the answer must be visible in the representation, interaction and pacing of the lesson.

That is the bridge from **Learning Intelligence** to a tutor that genuinely teaches differently.
