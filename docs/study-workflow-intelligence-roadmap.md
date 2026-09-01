# Quantora Study — Workflow Intelligence Roadmap

**Status:** Planned capability architecture / execution companion  
**Effective from:** 2026-09-01  
**Depends on:** `study-learning-intelligence-architecture.md` and `study-core-pillar-standardization-roadmap.md`  

## 1. Purpose

Quantora Study should not stop at tutoring, quizzes and flashcards. A strong private tutor also helps the learner decide **what to study, when to study it, what to extract from difficult material, what to revise later, and what to ignore for now**.

This roadmap adds two major learner-workflow capabilities:

1. **Adaptive Study Planning** — a living study schedule driven by goals, curriculum, learner evidence and retention needs.
2. **Grounded Notes Intelligence** — source-faithful understanding and summarization of PDFs, notes, slides and other study material with page/source provenance.

These capabilities must consume the existing learner graph and evidence architecture. They must never create a parallel mastery system.

---

## 2. Architectural rules

### 2.1 One learner truth still wins

The Study Planner may use:

- verified concept state;
- unresolved misconceptions;
- prerequisite gaps;
- retention due dates;
- curriculum/exam priorities;
- learner availability and explicit goals.

It may **not** mark a concept learned because the learner checked a schedule item as complete.

Imported notes, summaries and PDFs may create context, candidate concepts, candidate questions and recommended study actions. They do **not** become verified mastery evidence until the learner interacts through an admitted evidence path.

### 2.2 Native Quantora capability first

Quantora owns the canonical contracts for:

- document ingestion;
- provenance;
- summarization;
- concept mapping;
- learner planning;
- schedule generation;
- evidence admission.

External providers are optional adapters, never sources of learner truth.

### 2.3 Conversation first

These features must not become permanent dashboard clutter.

A learner should be able to ask naturally:

> "Plan my next 6 weeks for JEE Physics."

or:

> "Summarize this chapter and tell me what I need to focus on."

The result may open a focused planner or source view, but conversation remains the primary surface.

---

## 3. Capability A — Adaptive Study Planner

### 3.1 Product goal

Create and continuously rebalance a study plan around **actual learner need**, not a static timetable template.

### 3.2 Inputs

The planner may consume:

```text
learner_goal
exam_or_target
exam_date?
curriculum
subjects[]
availability_windows[]
preferred_session_length
verified_concept_state
prerequisite_graph
misconception_state
retention_due_at
recent_learning_activity
curriculum_weightage?
learner_explicit_priorities[]
```

Cold-start self-report is planning context only, not verified evidence.

### 3.3 Planner pipeline

```text
Goal / Exam / Date / Availability
              +
        Curriculum Graph
              +
          Learner Graph
              +
        Retention Schedule
              ↓
      STUDY PLANNING ENGINE
              ↓
 Today → This Week → Revision → Exam Readiness
```

### 3.4 Planning priorities

A defensible priority score should be composed from explainable factors such as:

- prerequisite blockage;
- verified weakness;
- misconception severity;
- retention due/overdue state;
- curriculum importance;
- exam proximity;
- estimated workload;
- dependency ordering;
- evidence uncertainty;
- learner-declared urgency.

Do not expose fake mathematical precision to the learner. Internally the planner may score candidates, but learner-facing reasons should remain human:

- "Do vectors first because projectile motion depends on them."
- "Revisit kinematics today because your retention check is due."
- "Reduce time on motion graphs because understanding is already verified."

### 3.5 Dynamic replanning

The planner must not behave like a static calendar template.

It should recompute when:

- a session is missed;
- the learner finishes early;
- a new prerequisite gap appears;
- mastery becomes verified;
- a misconception is confirmed or repaired;
- a retention probe becomes due;
- the exam date or available time changes;
- new source material or syllabus content is added.

A missed Monday session should not blindly shift every later item by one day. The planner should re-optimize the remaining plan against urgency, dependency and available time.

### 3.6 Session structure

A planned block may contain:

```text
plan_item_id
scheduled_date
estimated_minutes
subject
concept_id
activity_type
reason_code
learner_facing_reason
source_context?
retention_due_at?
status
plan_version
```

Allowed activity types should be bounded, for example:

- learn foundation;
- prerequisite repair;
- guided practice;
- independent retrieval;
- misconception repair;
- retention check;
- transfer practice;
- source review;
- mock/exam block.

### 3.7 Calendar integration policy

Phase 1:

- internal Quantora plan;
- clean daily/weekly view;
- downloadable calendar/ICS export where practical.

Phase 2:

- Google Calendar integration;
- optional reminders/notifications;
- eventually other calendar providers through a narrow scheduling adapter.

Calendar providers mirror the plan. They do not own planning logic or learner state.

### 3.8 Adaptive Study Planner exit gates

- no schedule completion event directly promotes mastery;
- prerequisite ordering is respected;
- retention-due concepts appear before arbitrary low-priority content;
- missed-session replanning is deterministic for the same inputs/model version;
- every planned activity has an explainable reason code;
- the planner cannot schedule unsupported hidden content as verified learning work;
- availability limits are respected;
- accessibility and mobile behavior pass browser gates.

---

## 4. Capability B — Grounded Notes Intelligence

### 4.1 Product goal

Turn difficult study material into a **source-grounded learning pack**, not a generic LLM summary.

The learner should be able to provide:

- PDF textbook chapters;
- lecture slides;
- class notes;
- screenshots;
- handwritten notes/photos;
- worksheets;
- exam papers;
- teacher handouts;
- syllabi.

### 4.2 Output modes

From one source, Quantora may produce:

- 5-minute summary;
- detailed structured summary;
- chapter/topic map;
- key concepts;
- definitions;
- formula sheet;
- important diagrams/tables;
- worked-example index;
- likely confusing points;
- misconception traps;
- exam-focused "must know" section;
- lower-priority "nice to know" section;
- candidate flashcards;
- candidate practice questions;
- quick revision sheet;
- learner-specific focus list.

### 4.3 Grounding contract

Every source-backed claim should preserve:

```text
source_id
source_type
source_name
page_or_slide?
block_id?
extraction_method
extraction_confidence?
source_text_anchor?
```

A learner-facing summary should cite source pages/slides when they exist.

If a page cannot be extracted reliably, Quantora must say so rather than silently reconstructing missing content.

### 4.4 Personalized notes intelligence

Generic summarization is only the first layer.

After concept mapping, Quantora should compare the source against the Learner Graph and produce guidance such as:

- "You already understand sections 1–2; focus on section 3."
- "This chapter assumes vector decomposition, which is still weak."
- "The worked example on page 27 directly targets your current misconception."
- "These formulas are already retained; these two require a later check."

This is a key Quantora differentiator: **source understanding + learner understanding**.

### 4.5 Summary truth rules

- imported material is untrusted input;
- source text cannot become hidden/system instruction;
- summaries must distinguish source fact from model interpretation;
- extracted text must retain provenance;
- generated flashcards/questions are candidates until governed/reviewed if they are ever allowed to contribute to verified mastery;
- reading or generating a summary never counts as mastery evidence.

### 4.6 Grounded Notes exit gates

- every supported PDF page has stable source/page provenance;
- source-backed summary claims can be traced back to source anchors;
- extraction failures are visible and fail safely;
- malicious document instructions cannot alter trusted system behavior;
- generated summaries do not create learner mastery events;
- learner-specific recommendations are traceable to learner graph + source concept mapping;
- page-level citations survive downstream Tutor use.

---

## 5. Capability C — Document Intelligence Adapter Layer

### 5.1 Provider-neutral boundary

Quantora should normalize all extraction providers into one internal document contract:

```text
StudySourceDocument
  document_id
  source_type
  file_metadata
  pages[]
  blocks[]
  tables[]
  figures[]
  extraction_method
  provenance
  security_scan_result
  normalized_at
  schema_version
```

Downstream summarization and concept mapping depend only on this contract.

### 5.2 Extraction strategy

Recommended ordering:

1. **Native Quantora ingestion/parser** for ordinary text PDFs/images where quality is sufficient.
2. **Specialist extraction/OCR adapter** for complex/scanned documents.
3. Provider-specific adapters only when they materially improve extraction quality or interoperability.

### 5.3 Adobe PDF Services position

Adobe PDF Services / Extract / OCR may be implemented as an **optional server-side extraction adapter** for complex, structured or scanned documents.

Rules:

- credentials remain server-only;
- provider output is normalized immediately into `StudySourceDocument`;
- Adobe-specific structures never leak into learner-truth contracts;
- pricing/quotas are isolated behind the adapter;
- native/fallback extraction remains possible;
- provider failure must not corrupt prior source state.

Adobe should improve extraction quality, not become Quantora's document architecture.

### 5.4 NotebookLM / Gemini Notebook position

NotebookLM-style services may be supported later as **optional source/export companions** where stable programmatic APIs and licensing make sense.

Quantora must not depend on NotebookLM for core Study behavior.

Rules:

- Quantora owns source ingestion, provenance, summaries and learner mapping;
- a Notebook service may contribute source material or generated study artifacts through an adapter;
- imported Notebook output remains untrusted content;
- Notebook-generated claims cannot directly write learner mastery;
- provider API maturity, licensing and data-handling terms must be revalidated at implementation time.

### 5.5 Other useful adapters

Potential future adapters:

- Google Drive / Docs;
- Google Classroom;
- Microsoft Education / OneDrive where appropriate;
- QTI assessment import/export;
- LTI / OneRoster / CASE later for institutional interoperability.

---

## 6. Security and ingestion requirements

Before broad PDF/note ingestion ships:

- validate content type using magic bytes, not filename alone;
- enforce byte, page and image-dimension limits;
- decode/re-encode images where appropriate;
- strip unsafe metadata/EXIF where appropriate;
- isolate imported text from trusted prompt/system layers;
- use malware/file-safety controls appropriate to the storage path;
- preserve deletion/lifecycle ownership;
- never put provider credentials in the browser;
- never log full imported content by default;
- maintain tenant/learner authorization for every source.

---

## 7. Relationship to the core roadmap

These capabilities do **not** replace H0–H5. They fit into them as follows:

### H0 — Hardening

No workflow-intelligence implementation except correctness/security prerequisites.

### H1 — UX / Onboarding

Collect the minimum useful planning inputs:

- exam/goal;
- curriculum/level;
- exam date if relevant;
- study availability;
- preferred session size.

Do not build the full planner before this profile contract is stable.

### H2 — Assessment Corpus / Diagnostic Breadth

Planner quality improves materially when Quantora has enough governed evidence to know what the learner actually needs.

### H3 — Persistent Scale / Observability

Implement the durable planning projection, plan versions, recomputation rules and scheduling telemetry.

### H4 — Native Ingestion + Grounded Notes Intelligence

Implement:

1. secure PDF/image ingestion;
2. page/source provenance;
3. structured extraction;
4. grounded summarization;
5. concept mapping;
6. learner-specific focus extraction;
7. candidate flashcards/questions;
8. optional Adobe extraction/OCR adapter.

### H4.5 — Adaptive Study Planner

Once learner graph + profile + retention + curriculum coverage are dependable:

1. daily/weekly planning engine;
2. missed-session replanning;
3. retention-aware scheduling;
4. exam-date optimization;
5. ICS export;
6. Google Calendar integration after the internal contract is proven.

### H5 — External Education Ecosystem

Add stable provider integrations without allowing any provider to bypass Quantora evidence rules.

NotebookLM/Gemini Notebook remains optional and should be considered only after native Grounded Notes Intelligence is strong enough that Quantora does not depend on it.

---

## 8. Recommended implementation PR sequence

Do not implement this inside the current H0.1 hardening PR.

After H0 is closed:

### WORKFLOW-01 — Planning profile contract

- exam/goal/date;
- curriculum/subjects;
- availability windows;
- session preference;
- explicit distinction between preference and evidence.

### WORKFLOW-02 — Secure source ingestion foundation

- source storage contract;
- validation limits;
- page/block provenance;
- injection isolation;
- lifecycle/deletion semantics.

### WORKFLOW-03 — Grounded Notes Intelligence

- structured summary modes;
- page citations;
- formula/key-concept extraction;
- concept mapping;
- learner-specific focus recommendations.

### WORKFLOW-04 — Extraction adapters

- native extraction baseline;
- optional Adobe PDF extraction/OCR adapter;
- adapter quality/cost telemetry.

### WORKFLOW-05 — Adaptive Study Planner

- planner candidate generation;
- bounded priority model;
- daily/weekly plans;
- deterministic replanning;
- retention scheduling;
- learner-facing reasons.

### WORKFLOW-06 — Calendar interoperability

- ICS export first;
- Google Calendar write integration only after internal planner semantics are stable;
- never let calendar state become learner truth.

### WORKFLOW-07 — Optional notebook/provider interoperability

- evaluate stable NotebookLM/Gemini Notebook APIs and licensing at implementation time;
- integrate only through provider-neutral source/artifact contracts;
- no provider-direct mastery writes.

---

## 9. Product completion standard

Workflow Intelligence is production-ready only when:

- the planner adapts to real learner evidence rather than producing static timetables;
- missing sessions trigger intelligent reprioritization;
- retention obligations are visible in planning;
- complex source material can be summarized with page/source traceability;
- summaries can be personalized against the learner graph;
- source ingestion cannot inject trusted instructions;
- external PDF/notebook/calendar providers remain replaceable adapters;
- no workflow feature creates a second learner truth.

The differentiated product is not "AI scheduling" plus "AI summarization". It is:

> **Quantora understands the material, understands the learner, and continuously decides what that learner should study next — with evidence and provenance behind the decision.**
