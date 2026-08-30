# Quantora Study — Learning Intelligence Architecture

**Status:** Architecture decision / execution contract  
**Owner:** Quantora Platform Architecture  
**Effective from:** 2026-08-30  
**Supersedes:** feature-by-feature Study planning where it conflicts with this document  

## 1. North Star

Quantora Study is not a chat product with education tools attached. It is an adaptive learning system whose learner-facing surface happens to be a conversation with a calm private tutor.

The permanent product question is:

> **What does this learner actually understand, what is holding them back, and what is the smallest next intervention that will move them forward?**

The Study loop is therefore:

**Understand → Diagnose → Teach → Observe → Verify → Adapt → Retain → Transfer**

The conversation remains the primary surface. Every feature must either:

1. produce trustworthy learning evidence,
2. improve diagnosis,
3. deliver the next best teaching move, or
4. reduce friction in the learner's path.

No feature earns permanent screen space merely because it exists.

---

## 2. Product Promise

**Quantora understands what you know, finds what is holding you back, and teaches you the next thing you actually need.**

This promise is implemented through one shared learning-intelligence spine, not separate intelligence inside Flashcards, Quiz, Tutor, Visuals, Practice or Revision.

---

## 3. Architecture Rule: One Learner Truth

There must be exactly one evidence-backed learner state.

```text
                    ONE LEARNER GRAPH
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       Tutor           Flashcards         Quiz
          │                │                │
          ├────────────────┼────────────────┤
          │                │                │
       Visual           Practice        Revision
          │                │                │
          └────────────────┴────────────────┘
                           │
                        Evidence
                           │
                           ▼
                    ONE LEARNER GRAPH
```

### Consequences

- Flashcards do not maintain their own mastery score.
- Quiz does not maintain a separate confidence model.
- Tutor does not infer mastery from conversational fluency.
- Self-reported confidence never becomes verified understanding.
- LLM prose never becomes the source of truth for mastery.
- Every learner-facing adaptation must be traceable to evidence or an explicit cold-start preference.

The existing server-side learner model is the starting source of truth and already supports understanding state, misconception signals, retention state and next-learning-move selection. The architecture evolves that model into a durable learner graph rather than replacing it.

---

## 4. Learner Graph

The Learner Graph is a persistent, versioned projection over evidence.

### 4.1 Core node

Each canonical concept node should eventually contain:

```text
concept_id
curriculum_id
subject_id
prerequisite_ids[]
understanding_state
understanding_estimate
misconception_state
misconception_codes[]
retention_state
confidence_calibration
latest_evidence_at
verified_evidence_count
evidence_kinds[]
next_learning_move
model_version
```

### 4.2 Learner-facing state

Do not expose fake precision such as "Entropy mastery 62.7%" unless the model has a defensible statistical basis and the value is genuinely useful.

Prefer human states:

- Getting oriented
- Building understanding
- Repairing a mix-up
- Checking the repair
- Needs a later check
- Understanding verified
- Ready to stretch

### 4.3 Evidence classes

Verified evidence can include:

- assessment item
- independent retrieval
- application
- transfer
- teach-back
- retention probe
- misconception probe

The system must preserve provenance, time, independence, item identity and scoring basis.

---

## 5. Gap Assessment Engine

Gap diagnosis is a first-class platform capability, not a quiz mode.

A wrong answer is not one problem. Quantora must distinguish at least:

| Gap type | Meaning | Typical next move |
| --- | --- | --- |
| Missing knowledge | Concept not yet learned | Teach foundation |
| Prerequisite gap | Earlier concept is blocking progress | Step backwards |
| Misconception | Learner holds an incorrect mental model | Contrast / counterexample |
| Retrieval weakness | Understanding exists but recall is weak | Spaced retrieval |
| Application gap | Knows facts/formula but cannot select/use them | Contextual application |
| Representation gap | Understands one representation but not another | Switch modality |
| Procedural error | Process breaks at a specific step | Repair exact step |
| Transfer gap | Near examples work; novel context fails | Transfer task |
| Retention gap | Learning decays over time | Delayed no-hint probe |
| Confidence calibration | Confidence and performance diverge | Metacognitive feedback |

### 5.1 Adaptive diagnostic behavior

The default diagnostic is short and information-seeking.

- Start with a small set of high-information items.
- After every response, choose the next item that most reduces uncertainty.
- Branch downward when prerequisites are suspect.
- Stop testing areas already demonstrated strongly enough.
- Confirm a misconception before treating it as established.
- Never mark mastery from one lucky answer.

The long-term selection engine may use Bayesian Knowledge Tracing, Item Response Theory, information gain or a hybrid model, but the first production version should stay explainable and testable.

### 5.2 Diagnostic output

The diagnostic does not simply return a score. It updates:

- concept state
- prerequisite state
- misconception hypotheses
- confidence calibration
- evidence diversity
- recommended next move
- recommended revision timing

---

## 6. Assessment Item Architecture

LLMs may draft candidate questions. They do not get to manufacture verified answer keys directly into production evidence.

Every governed assessment item should support structured metadata such as:

```text
item_id
concept_id
curriculum_id
grade_or_level
subject
difficulty
cognitive_skill
prerequisite_ids[]
misconception_codes[]
representation
question_type
answer_key
rubric
discrimination
review_status
source
version
```

### Release rule

Only reviewed / governed items may contribute to high-confidence verified mastery unless an explicitly designed rubric path can grade the item deterministically enough for the target use case.

Use QTI-compatible concepts where practical so Quantora does not trap assessment content in a proprietary dead end.

---

## 7. Tutor Planner

The Tutor Planner consumes the Learner Graph and decides the next pedagogical move.

It should select among a finite, allow-listed family such as:

- independent retrieval
- diagnose misconception
- confirm misconception repair
- guided repair
- vary evidence
- retention probe
- transfer task
- prerequisite recovery
- visual representation switch
- worked-example fadeout

The language model performs the teaching move. It does not decide the learner truth.

### Teaching contract

**Understand → acknowledge → teach one thing → show if useful → ask one question → STOP → listen → adapt.**

The Tutor must never try to demonstrate how much it knows. It demonstrates how well it understands the learner.

---

## 8. Human Reinforcement Layer

Quantora should feel encouraging without becoming childish or gamified.

### 8.1 Semantic micro-interactions

Create a small, reusable motion vocabulary:

1. **Recognition** — restrained thumbs-up/check motion
2. **Insight** — lightbulb trace
3. **Progress** — short advancing line
4. **Repair** — broken line reconnects
5. **Mastery** — circle completes around concept
6. **Return** — bookmark / memory cue

### 8.2 Trigger rule

Animation is triggered by evidence significance, not by message completion.

Examples:

- Correct after a prior misconception: stronger recognition
- Solved independently after scaffolding: recognition of independence
- Clever cross-concept connection: insight cue
- Wrong answer: no failure shake, no red punishment state

### 8.3 Motion constraints

- normally 300–700 ms
- no endless loops
- no interaction blocking
- no confetti
- no generic praise after every answer
- reduced-motion accessibility must be respected
- acknowledgement text must name the learner behavior where possible

Example:

> "You corrected the sign error from earlier."

is superior to:

> "Great job!"

---

## 9. Adaptive Flashcards

The flashcard UI remains clean and focused.

After reveal, the learner can provide a lightweight confidence signal:

**Got it · Almost · Missed it**

This is useful evidence, but it is not verified mastery by itself.

### Behavior

- **Got it** → consider a changed representation or transfer check
- **Almost** → test the same concept from another angle
- **Missed it** → diagnose the exact missing distinction and repair it

A card should not simply reappear because the learner missed it. The system should reason about why it was missed.

Flashcards consume and contribute to the same Learner Graph used by Tutor, Quiz and Practice.

---

## 10. First-Run Study Onboarding

The first Study visit should feel like cinematic product onboarding, not account administration.

### 10.1 Principles

- 4–5 short screens maximum
- every step skippable
- progressive disclosure
- cinematic but restrained motion
- collect only cold-start information that materially improves Study
- do not pretend self-report is evidence

### 10.2 Suggested flow

1. **Welcome** — "Let's figure out how you learn."
2. **What are you studying?** — School / University / Professional / Personal
3. **Curriculum / level / subjects** — only after relevant path is selected
4. **What matters most right now?** — understand, exam, grades, assignment, revise, explore
5. **Optional quick diagnostic** — "Want me to find your strongest and weakest areas?"

### 10.3 Progressive profiling

The long-term profile should be learned from behavior, not demanded through forms.

Potential profile context:

- curriculum
- level / grade
- subjects
- target exam
- exam date
- goal
- study availability
- preferred explanation modality
- recurring misconceptions
- confidence calibration
- pace
- recent topics
- retention history

---

## 11. Data Ingestion Architecture

Study should eventually accept:

- PDFs
- lecture slides
- screenshots
- homework photos
- handwritten notes
- exam papers
- worksheets
- syllabi
- classroom materials
- LMS assignments

### Pipeline

```text
Source
  ↓
Ingestion boundary
  ↓
Validation / normalization
  ↓
Text + structure extraction
  ↓
Provenance + page/source anchors
  ↓
Concept mapping
  ↓
Curriculum alignment
  ↓
Tutor context / candidate assessments
  ↓
Evidence only after learner interaction
```

### Non-negotiables

- preserve provenance
- do not silently hallucinate missing pages/content
- strip unsafe metadata where appropriate
- validate image type by content, not filename
- enforce byte/dimension/page limits
- never treat imported document text as trusted hidden instruction

---

## 12. Integration Strategy

Do not build a separate bespoke contract for every education provider.

### Consumer / direct integrations

**Google Classroom API** can provide courses, coursework, materials, rubrics, student submissions, teachers, students and topics.

**Microsoft Graph Education API** can provide schools, classes, students, teachers, assignments, submissions, resources and outcomes.

### Institutional standards spine

**LTI 1.3 / LTI Advantage** — secure LMS launch, roles, assignment/grade exchange and deep linking.

**OneRoster** — roster, enrollment and gradebook synchronization.

**QTI** — portable assessment items/tests/results.

**CASE** — curriculum / competency identifiers where appropriate.

**Caliper Analytics** — standardized learning activity events and cross-platform analytics.

### Integration ordering

1. native Quantora ingestion and evidence model
2. Google Classroom
3. Microsoft Education
4. QTI import/export
5. LTI Advantage
6. OneRoster / CASE
7. Caliper analytics interoperability

Do not start institutional integrations until the learner truth model is stable enough to justify them.

---

## 13. Event / Evidence Ledger

All meaningful learning interactions should be emitted as versioned events.

Example envelope:

```text
event_id
learner_id
session_id
concept_id
item_id?
event_type
observed_at
independent
score?
correct?
confidence?
misconception_signal?
representation?
source_context?
model_version
```

The Learner Graph is a projection over this ledger.

### Why this matters

- auditability
- replay / model upgrades
- longitudinal learning
- retention measurement
- analytics
- institutional interoperability
- prevention of accidental mastery inflation

---

## 14. Quantora Monochrome Design System

The Study roadmap adopts a strict black/white visual language as the next implementation phase.

### 14.1 Palette

Only:

```css
#000000
#FFFFFF
```

No grey, slate, orange, blue, green, gradient or semi-transparent decorative tint in the target system.

### 14.2 Hierarchy without color

Use:

- typography
- scale
- whitespace
- border thickness
- solid vs outline
- black/white inversion
- line style
- pattern / hatching for charts
- motion

### 14.3 Semantic state

Do not depend on color alone for meaning.

Correctness, selection, focus and warning states must remain clear through iconography, text, shape and/or pattern.

### 14.4 Migration rule

Do not patch isolated Study screens with hard-coded black/white values.

First establish semantic design tokens and component contracts, then migrate surfaces systematically.

No new arbitrary inline accent colors should be introduced after the migration begins.

---

## 15. Accessibility and Safety

Study is an education product. Accessibility and learner dignity are product requirements.

- reduced-motion support
- keyboard navigation
- visible focus state without relying on gray/opacity alone
- screen-reader labels for visuals and interactions
- sufficient contrast by construction
- never shame wrong answers
- never infer protected or sensitive traits from learning behavior
- do not expose internal learner labels unnecessarily
- age-appropriate defaults for younger learners
- explicit provenance for imported sources

---

## 16. Metrics

Primary product metric:

> **Verified Learning Gain per 20 Minutes**

Supporting metrics:

- time to first genuine gap identified
- prerequisite-gap detection precision
- misconception repair rate
- verified understanding conversion
- 1-day / 7-day / 30-day retention
- transfer success
- unnecessary diagnostic question rate
- false-mastery rate
- learner return rate
- average intervention count to repair

### Critical quality metric

**False mastery is a severe defect.**

The platform should prefer "insufficient evidence" over an impressive but unsupported score.

---

## 17. Delivery Roadmap

### Phase A — Architecture Lock

**Goal:** one product and technical contract.

Deliverables:

- this architecture document
- one learner truth decision
- one evidence ledger direction
- one integration ordering
- one monochrome design-system direction
- explicit exit gates for subsequent phases

**Exit gate:** no new Study capability is approved if it creates a second source of learner truth.

---

### Phase B — Black / White Design System

**Goal:** establish the permanent visual foundation before adding more Study chrome.

Deliverables:

- semantic monochrome tokens
- black/white component primitives
- remove Study gradients / accent colors
- migrate Flashcards, Tutor shell, visual cards and Study controls
- accessibility states without gray/color dependence
- regression screenshots / browser gates

**Exit gates:**

- target Study surfaces use only #000 and #FFF for UI color
- no gradients on Study surfaces
- no hard-coded legacy orange/slate/blue/green in migrated Study components
- keyboard/focus/reduced-motion gates pass
- conversation remains dominant

---

### Phase C — Human Reinforcement + Onboarding

**Goal:** make Study feel like a thoughtful private tutor from first visit onward.

Deliverables:

- semantic reinforcement motion system
- reasoning-specific acknowledgement
- first-run cinematic onboarding
- progressive learner-profile storage
- skip / accessibility / reduced-motion paths

**Exit gates:**

- animation only fires on meaningful events
- no generic repetitive praise
- onboarding can be skipped completely
- self-report remains separate from mastery evidence

---

### Phase D — Diagnostic Gap Engine

**Goal:** identify the highest-leverage learning gaps quickly.

Deliverables:

- canonical gap taxonomy
- prerequisite graph support
- short adaptive diagnostic
- misconception confirmation
- diagnostic stop criteria
- explanation of why each next item was selected in internal logs

**Exit gates:**

- adaptive path demonstrably asks fewer unnecessary questions than fixed quiz path
- prerequisite and misconception branches are covered by integration tests
- no single-answer mastery promotion

---

### Phase E — Persistent Learner Graph

**Goal:** make the learner model durable across sessions and capabilities.

Deliverables:

- versioned evidence ledger
- persistent concept projection
- retention timeline
- confidence calibration
- migration from current session-only / partial projections where applicable

**Exit gates:**

- Tutor, Flashcards, Quiz and Practice consume the same projection
- evidence can be replayed into the same graph state deterministically
- model upgrades are versioned

---

### Phase F — Unified Adaptive Mastery Loop

**Goal:** every Study tool becomes an expression of one learning system.

Deliverables:

- Got it / Almost / Missed it evidence contract
- adaptive flashcards
- adaptive quiz sequencing
- Tutor next-move planner
- spaced retention probes
- transfer checks

**Exit gates:**

- no feature-local mastery databases
- changed representation after near-miss
- misconception repair is verified before promotion
- retention evidence influences future planning

---

### Phase G — Ingestion + External Integrations

**Goal:** connect the learner graph to the student's actual learning world.

Deliverables in order:

1. robust PDF / image / notes ingestion
2. Google Classroom
3. Microsoft Education
4. QTI import/export
5. LTI Advantage
6. OneRoster / CASE
7. Caliper analytics interoperability

**Exit gates:**

- provenance preserved end-to-end
- imported content cannot become hidden instructions
- permissions/scopes follow least privilege
- institutional integrations cannot directly write mastery without Quantora evidence rules

---

## 18. PR and Change-Control Rules

1. One phase = one or more small isolated PRs.
2. Do not bundle learner-model changes with provider/routing changes unless unavoidable.
3. Do not bundle design-system migration with diagnostic logic.
4. Every state model change requires migration/version strategy.
5. Every assessment behavior change requires evidence-path tests.
6. Every micro-animation requires reduced-motion behavior.
7. Every new integration requires provenance, permission and failure-mode design.
8. Every PR must state whether it changes learner truth, evidence generation or only presentation.
9. No automatic production merge without required CI/browser/deployment gates.
10. If an implementation conflicts with this document, change the architecture decision explicitly before changing code.

---

## 19. Current-State Alignment

Quantora already has important foundations:

- conversation-first Study UX direction
- human-tutor interaction contract
- server-side evidence-backed learner model
- misconception / retention projections
- allow-listed adaptive next moves
- adaptive tutor client adapter
- deterministic native Study visuals
- flashcard experience

This roadmap deliberately builds on those pieces rather than replacing them.

The next production implementation phase is therefore **Phase B — Quantora Monochrome Design System**.

---

## 20. External Standards / Product References

These references inform integration and product architecture; they are not copied implementations.

- GenieBook personalised learning / gap-driven planning: https://geniebook.com/
- GenieBook product approach: https://geniebook.com/why_geniebook
- Google Classroom REST API: https://developers.google.com/workspace/classroom/reference/rest
- Microsoft Graph Education API overview: https://learn.microsoft.com/en-us/graph/education-concept-overview
- 1EdTech LTI: https://www.1edtech.org/standards/lti
- 1EdTech QTI: https://www.1edtech.org/standards/qti
- 1EdTech Caliper Analytics: https://www.1edtech.org/standards/caliper
- 1EdTech standards catalog: https://www.1edtech.org/specifications

---

## 21. Final Decision

Quantora Study will evolve as **Learning Intelligence**, with Study Tutor as the learner-facing experience.

The moat is not chat, flashcards, quizzes, diagrams or animation individually.

The moat is:

> **one trustworthy learner graph that continuously diagnoses gaps and chooses the next best teaching move across every Study experience.**
