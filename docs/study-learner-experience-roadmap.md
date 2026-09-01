# Quantora Study — Learner Experience Roadmap

**Status:** H1 execution contract / learner-facing companion  
**Effective from:** 2026-09-01  
**Depends on:** `study-learning-intelligence-architecture.md`, `study-core-pillar-standardization-roadmap.md`, `study-workflow-intelligence-roadmap.md`  

## 1. Product rule

Quantora Study remains a calm private tutor, not a dashboard of AI features.

Every learner-facing surface must do at least one of these things:

1. reduce friction in learning;
2. make trustworthy learner history easier to understand;
3. help the learner organize or revisit their own work;
4. expose an existing learning capability without competing with the conversation.

No engagement metric, notebook entry, completed schedule item, self-report, or time-spent value may become verified mastery evidence by itself.

---

## 2. Current status after H0

| Capability | Status | What remains |
| --- | --- | --- |
| Adaptive mastery / next-best-action | **Core implemented** | H3 projection/snapshot scale and broader curriculum coverage |
| Retention intelligence | **Implemented and production-canary proven** | H2 content breadth so retention probes exist across supported curriculum |
| Transfer intelligence | **Implemented and production-canary proven** | H2 reviewed application-item breadth on governed transfer targets |
| Human reinforcement | **Pending — H1** | semantic evidence-triggered micro-interactions and reduced-motion behavior |
| Unified learner-facing Study surfaces | **In progress — H1.1** | monochrome shell, three primary actions, progressive disclosure Study Hub |
| First-run onboarding | **Pending — H1.4** | short skippable cold-start profile; self-report remains context only |
| Assessment history | **Pending — H1.2** | authoritative 30-day learner history surface |
| Learner notebook | **Pending — H1.3** | subject/topic organization, autosave, explicit separation from mastery truth |
| Time / activity trends | **Pending — H3** | privacy-safe active-time telemetry and learner-facing progress view |
| Native PDF / notes ingestion | **Pending — H4** | provenance, page anchors, file validation, prompt isolation |
| Classroom / LMS integrations | **Pending — H5** | Google Classroom → Microsoft Education → QTI/LTI/OneRoster/CASE/Caliper |

---

## 3. H1.1 — Monochrome Study Hub and progressive disclosure

### Goal

Reduce permanent Study controls to three learner moves:

- **Explain**
- **Practice**
- **Check**

Secondary capabilities move behind one bottom-right **Study Hub** launcher.

### Study Hub rules

- conversation remains the dominant surface;
- the launcher is compact, monochrome, keyboard accessible and reduced-motion safe;
- the Hub exposes only capabilities that actually work today;
- no "coming soon" tiles;
- no fake dashboard placeholders;
- opening a tool does not create learner truth;
- future Assessment History, Notebook and Progress surfaces plug into the same Hub when their data contracts are real.

### Initial Hub actions

- Explain differently
- Show visually
- Flashcards
- Real-world example
- Make concise notes from the current conversation
- Where next?

Low-value permanent novelty controls are deliberately removed from the always-visible shell.

---

## 4. H1.2 — Assessment History

### Why this adds value

A learner should be able to answer:

- What checks have I taken recently?
- Which subjects/concepts did I work on?
- What was my score?
- Did I improve on later independent evidence?
- Which areas still need another check?

This improves trust and continuity because it exposes authoritative history already produced by the Study evidence system.

### Default learner surface

Default window: **last 30 days**.

Each history row should show only learner-useful fields such as:

```text
submitted_at
subject / concept
assessment type
score / correct state
item difficulty where useful
learner-facing outcome
```

Do not expose:

- answer keys before/after as a bulk dump;
- internal service-role identifiers;
- raw misconception taxonomy codes unless translated into humane learner language;
- hidden grading/governance metadata.

### Truth rule

Assessment History reads authoritative attempts/evidence. It never recomputes mastery in the browser.

---

## 5. H1.3 — Learner Notebook

### Why this adds value

A personal notebook materially reduces context switching. The learner should be able to keep their own notes beside the tutor instead of moving between Quantora and another note-taking product.

### First version

Organize by:

```text
subject
optional topic / concept
note title
note body
created_at
updated_at
```

Support:

- create / edit / delete;
- autosave;
- subject/topic filtering;
- simple Markdown or structured plain-text editing;
- one-click "add from conversation" only when the learner explicitly requests it.

### Truth rule

Learner-authored notes are **personal study material, not verified evidence**.

A note saying "I understand thermodynamics" does not change mastery. A later verified interaction may use the note as context, but evidence admission remains unchanged.

### Future H4 bridge

The same Notebook can later contain source-linked notes from PDFs/slides with page provenance. Native learner-authored notes should not wait for H4 ingestion.

---

## 6. H3 — Time and learning-activity trends

### Why this adds value

A time trend can help students build consistency and understand how they are allocating study effort. It becomes harmful if Quantora reports inflated "study hours" simply because a tab was open.

### Measurement contract

Measure **active engaged time**, not page-open duration.

An activity clock should pause after bounded inactivity and resume only on meaningful interaction.

Potential categories:

- Tutor / Study
- Practice
- Verified checks / assessments
- Flashcards
- Notebook
- Revision / retention

### Learner-facing view

A simple 7 / 30 / 90-day view can show:

- X-axis: date;
- Y-axis: active minutes/hours;
- grouped or stacked by activity category;
- total active study time;
- optional subject filter;
- consistency trend.

Avoid:

- leaderboards;
- guilt-driven streak punishment;
- equating time spent with mastery;
- fabricated precision when telemetry is incomplete.

### Why H3, not H1

The H3 observability wave already owns privacy-safe telemetry, event definitions, latency/SLO instrumentation and durable learner projections. Time analytics should use that governed event spine instead of creating a second browser-local analytics truth.

---

## 7. H1.4 — Human reinforcement and onboarding

### Reinforcement

Trigger feedback from evidence significance, not generic message completion.

Examples:

- repaired a prior misconception;
- solved independently after scaffolding;
- completed a delayed retention check;
- succeeded on a genuine transfer task.

Never use failure shakes, red punishment, confetti or praise after every answer.

### Onboarding

Keep first-run Study onboarding to 4–5 skippable steps:

1. study context;
2. curriculum / level / subjects;
3. current goal;
4. optional exam/date/availability;
5. optional quick diagnostic.

Self-report is planning context only and never becomes verified learner truth.

---

## 8. Recommended execution sequence

```text
H1.1  Monochrome shell + Study Hub
  ↓
H1.2  30-day Assessment History
  ↓
H1.3  Learner Notebook
  ↓
H1.4  Onboarding + semantic reinforcement
  ↓
H2    Assessment corpus / diagnostic breadth
  ↓
H3    Durable learner projection + observability + active-time trends
  ↓
H4    Native ingestion / grounded document notes
  ↓
H5    Classroom / LMS ecosystem
```

This sequence deliberately makes the learner experience useful now without turning engagement features into a parallel learning-intelligence system.
