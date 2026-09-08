# Quantora Adaptive Learning Runtime v1 — Delivery Roadmap

**Status:** Active programme  
**Baseline date:** 9 September 2026  
**Objective:** Transform Quantora Study from a primarily conversational learning experience into an adaptive learning runtime that observes how a learner is thinking, selects an appropriate teaching strategy, delivers the right visual or interactive experience, verifies learning, and continuously adapts.

## North Star

Quantora should not simply ask:

> How can I answer this question?

It should ask:

> What does this learner need to experience next to understand this concept?

The target runtime loop is:

**Observe → Understand → Decide → Show → Interact → Probe → Verify → Adapt → Remember**

## Delivery Model

The original programme is planned as approximately **15 PRs in total**, counting the Adaptive Learning Mission foundation.

The work must remain modular and surgical. Each PR should deliver one bounded capability, include its own tests, and be independently releasable. We should ship continuously rather than wait for the entire programme to finish.

### Current shipped foundations

- **Adaptive Learning Mission** — shipped. Establishes the governed loop: **Explain → Guided Practice → Verified Check → Review**.
- **PR delivery / CI hardening** — shipped as a delivery enabler; not part of the original 15-learning-PR estimate.
- **Governed visual capability routing** — shipped. Normal **Show visually** can now route into governed native visual capabilities rather than being confined to static visual prompting.

## PR Roadmap

### Foundation — Adaptive Learning Mission

Establish the governed learning mission lifecycle:

**Explain → Guided Practice → Verified Check → Review**

This is the execution container for the rest of the adaptive runtime.

### PR 1 — Visual Capability Router

Deterministically select the best available representation for a concept and learner request:

- micro visual
- diagram
- animation
- interactive lab
- static picture

Use native governed capabilities where available and preserve truthful fallbacks where they are not.

**Status:** Core governed routing shipped.

### PR 2 — Micro Visual Primitives

Create a reusable inline visual language for Study, including:

- force vectors and arrows
- number lines
- mini graphs and coordinate planes
- timelines
- equation transformations
- fraction / proportion models
- labelled process diagrams
- before / after states
- flow and cause-effect diagrams

The goal is to make useful visuals part of the lesson itself instead of relying on large standalone images.

### PR 3 — Interactive Labs v1

Create reusable learner-manipulable experiences for initial high-value concepts, starting with Physics and Mathematics.

Core interaction pattern:

**Predict → Manipulate → Run → Observe → Explain / Answer**

### PR 4 — Learning Interaction Signals

Define a governed event contract for meaningful learner actions such as:

- correct / incorrect response
- answer changed
- hint requested
- hint depth used
- repeated explanation requested
- visual requested
- simulation manipulated
- prediction made
- retry success
- retrieval success

These are observations only. They must not directly write mastery.

### PR 5 — Learner Working State

Derive a temporary, evidence-aware view of what may be happening for the learner right now, for example:

- misconception candidate
- hint dependence
- preferred representation for the current concept
- recent struggle / success pattern
- confidence alignment
- scaffolding need

This working state must remain distinct from verified learner truth and should decay or change as evidence changes.

### PR 6 — Learning Experience Director v1

Introduce the central deterministic pedagogy director that chooses what Quantora should do next.

Inputs may include:

- learner truth
- learner working state
- concept and prerequisite context
- mission phase
- recent interactions
- available time
- supported representation capabilities

Outputs may include:

- teaching strategy
- modality
- explanation density
- interaction type
- difficulty
- hint policy
- verification requirement
- reason codes

The LLM may generate content within the selected strategy, but it must not own learner truth or mastery decisions.

### PR 7 — Adaptive Hint Ladder

Move beyond binary “try again / show answer” behaviour with progressive tutoring support:

1. attention cue
2. directional hint
3. structural hint
4. visual / partial scaffold
5. worked step
6. answer only when appropriate

Record which level unlocked progress as a learning signal.

### PR 8 — Prediction-First Learning

Before explaining suitable concepts, ask the learner to predict what will happen.

Use the cycle:

**Predict → Observe → Confront mismatch → Explain → Re-predict / Verify**

This should become a signature interaction pattern for conceptual learning.

### PR 9 — Misconception Repair Engine

Create explicit misconception diagnosis and repair flows:

**Candidate misconception → discriminating probe → confirmed misconception → targeted repair → governed verification**

Avoid treating every wrong answer as proof of a specific misconception.

### PR 10 — Adaptive Difficulty Controller

Continuously choose whether to:

- reduce difficulty
- maintain difficulty
- increase difficulty
- change representation
- add / remove scaffolding
- switch recognition to retrieval
- switch routine practice to application

Difficulty adaptation must remain evidence-driven and explainable.

### PR 11 — Learning Feedback Motion

Introduce evidence-aware encouragement and micro-motion:

- subtle success motion
- progress / mastery transitions
- misconception-correction acknowledgement
- independent-retrieval recognition
- delayed-retention recognition
- meaningful streak / continuation feedback

Avoid random confetti or decorative GIF spam. Motion should respond to real learning events and respect reduced-motion accessibility.

### PR 12 — Session Continuity Protocol v2

Make Quantora remember the learner’s recent learning journey across sessions, including:

- unresolved misconception
- previous hint dependence
- concepts recently mastered
- concepts due for retention
- unfinished missions

A returning learner should feel that the tutor remembers where they struggled and what should happen next.

### PR 13 — Adaptive Runtime Integration

Connect the major systems into one closed loop:

**Learning Compass → Adaptive Mission → Experience Director → Visual / Interactive Runtime → Governed Assessment → Learner Model → Study Schedule / Retention**

This PR should integrate existing authorities rather than duplicate them.

### PR 14 — Adaptive Learning Evaluation & Hardening

Prove that the runtime actually adapts by testing contrasting learner profiles, for example:

- strong concepts but careless arithmetic
- formula memorisation with weak conceptual understanding
- visual-scaffold dependence
- confident misconception
- strong immediate performance but poor retention

The same lesson should produce meaningfully different teaching trajectories when the evidence justifies it.

Primary evaluation should focus on learning outcomes and misconception repair, not engagement metrics alone.

## Estimated Delivery Timeline

At the current development pace, assuming PRs remain surgical and unrelated repository work does not interfere:

### Critical transformation — first 6 PRs after the foundation

**Estimated: 3–5 working days**

Includes:

- Visual Capability Router
- Micro Visual Primitives
- Interactive Labs v1
- Learning Interaction Signals
- Learner Working State
- Learning Experience Director v1

At this point, Quantora should already feel visibly different and materially more adaptive.

### Full Adaptive Learning Runtime v1 programme

**Estimated: 8–12 working days**

A realistic target is approximately **two working weeks**, including implementation, tests, CI, review fixes, and clean merges.

### Contingency

If GitHub, CI, review, or deployment blockers repeatedly interfere, allow approximately **2–3 weeks**.

The programme should not be allowed to drift into a multi-month rewrite. The architecture is deliberately modular so value can be shipped incrementally.

## Preferred Delivery Rhythm

| Working days | Primary focus |
| --- | --- |
| Day 1–2 | Visual transformation |
| Day 3–5 | Learner observation + adaptive teaching brain |
| Day 6–8 | Hints, prediction-first learning, misconception repair, difficulty control |
| Day 9–10 | Motivation, continuity, runtime integration |
| Day 11–12 | Evaluation, hardening, cleanup |

## Critical Path

The first six capabilities provide the earliest major product transformation:

1. Visual capability selection
2. Micro visuals
3. Interactive labs
4. Interaction signals
5. Learner working state
6. Learning Experience Director

Once these exist together, Quantora can begin to **observe → decide → teach differently** rather than merely generate a different paragraph.

## Architectural Guardrails

1. **Learner Truth is governed.** Only verified evidence may update mastery or learner truth.
2. **Working State is temporary.** Hesitation, hint requests, or interaction patterns are signals, not permanent labels.
3. **Pedagogy is inspectable.** The Experience Director should expose deterministic reason codes for its decisions.
4. **LLMs generate within constraints.** They may produce explanations or structured content but should not independently decide mastery.
5. **Visuals must be pedagogical.** Animation is used because it helps teach a concept, not because motion looks impressive.
6. **Interactions do not equal mastery.** Simulations, clicks, time-on-task, and engagement are learning signals only until governed verification occurs.
7. **Reuse before rebuilding.** Existing Quantora capabilities should be wired and extended before creating parallel systems.
8. **Accessibility is mandatory.** Interactive and animated experiences require keyboard/touch usability and reduced-motion fallbacks.
9. **Ship continuously.** Every PR should leave production in a coherent, useful state.

## Product Outcome

Within the first moments of Study, the learner should feel that Quantora is not merely waiting for another prompt — it is paying attention to how they are reasoning.

Within a short learning session, Quantora should be able to change explanation style, representation, scaffolding, challenge level, or activity based on observed learner behaviour and verified evidence.

The intended differentiator is:

> Quantora should know what learning experience to create for this learner, for this concept, right now.
