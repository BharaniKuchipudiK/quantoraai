# Quantora Study Tutor Workspace — Action Roadmap & UX Redesign Pipeline

> Planning only. This branch must not change application code, SQL, APIs, environment variables, Main, or Production.

## North Star

Conversation first. Learning controls stay available without taking over the screen. Every Study feature must earn its space, produce evidence, or move the learner forward.

## Delivery pipeline

| Phase | Focus | Exit gate |
|---|---|---|
| P0 | Plan & isolate | Roadmap approved. Planning PR remains Draft. No application code touched. |
| P1 | UX shell | Conversation-first layout passes UX gates and existing Study tests. |
| P2 | Attachments + PDF | Clipboard image, file upload, PDF ingest/export have real browser tests and clear failure states. |
| P3 | Learning intelligence | Canonical concept resolver + learning map + advisor candidate are wired; Study orphans reduced. |
| P4 | Verified assessments | Issue → answer → evidence → mastery → next action works in a real integration test. |
| P5 | Visual intelligence | Deterministic visuals verified; generated images only behind explicit budget/policy. |
| P6 | Security + reliability | Durable rate limits, media hygiene, provider failover and production observability. |

**Decision:** start with P1. Do not add another Study feature until the conversation-first shell is fixed.

---

## P1 — Immediate UX redesign

### Current problems

- The Study Board behaves like a second application inside the conversation.
- The board is too tall and pushes lesson history out of view.
- Status is repeated in multiple places.
- Too many action chips are always visible.
- The current `This Topic` menu is too large and blocks content.
- Interactive diagrams take permanent space even after the learning beat is over.

### Proposed UX: Conversation-First Focus System

Replace the giant persistent card with three layers:

1. **Focus Bar** — 44–56 px high. Topic, state, next action, Open Focus.
2. **Focus Rail** — 280–320 px. Learning map, evidence, secondary actions. Collapsible on desktop; bottom sheet on smaller screens.
3. **Inline Learning Card** — only the activity happening now: diagram, quiz, worked example. It lives in chronological chat and collapses when finished.

Replace the large `This Topic` menu with a **Topic Action Palette**:

- max 320×360 px
- anchored popover
- scrollable
- keyboard accessible
- closes on selection or Escape
- New topic, Explain, Practice, Quiz, Flashcards, More

### What the Newton screen should become

- Compact top bar: `Newton's Laws • Not checked yet • Next: one check`.
- Lesson stays in the conversation.
- FBD appears only when pedagogically useful or explicitly opened.
- Under the visual: one concise explanation + one primary CTA: `Try a check`.
- Always-visible actions: **Explain • Practice • Check**.
- Move Plan / Real world / Flashcards / Notes / Schedule / I got this wrong behind **More** or into Focus Rail.
- Hide competency metadata by default.
- Completed quiz/diagram collapses into a short summary strip with `Review` / `Try another`.

### P1 acceptance gates

- On 1440×900 desktop, collapsed Study controls consume **≤64 px vertically**.
- Conversation remains the dominant surface.
- No Study popover/panel hides the top lesson content by default.
- Maximum **3 primary Study actions** visible at once.
- Only the current question/activity is expanded.
- Completed activities auto-collapse and can be reopened.
- Desktop = side rail; tablet/mobile = bottom sheet; no horizontal overflow.
- Keyboard navigation, Escape behavior, ARIA roles/labels, and visible focus states work.
- Existing verified assessment issue/grade flow and Study lesson streaming still pass.

### First implementation sprint — exact scope

1. Extract Study Board sections into components without changing behavior.
2. Build collapsed Focus Bar and desktop Focus Rail.
3. Replace large `This Topic` popover with compact action palette.
4. Collapse visible actions to Explain / Practice / Check + More.
5. Make visual lab and completed assessment collapsible.
6. Add responsive bottom-sheet behavior for narrow screens.
7. Add accessibility + browser regression tests.
8. **Do not touch PDF, image generation, mastery logic, or database in this sprint.**

---

## P2 — Attachments + PDF

| ID | Priority | Action | Exit criterion |
|---|---|---|---|
| STUDY-MEDIA-01 | P0 | Add clipboard image paste | Cmd/Ctrl+V screenshot becomes an attachment preview and sends correctly. |
| STUDY-MEDIA-02 | P0 | Unify attachment picker | One obvious Attach control for image/PDF; remove duplicate paperclips. |
| STUDY-MEDIA-03 | P0 | Server-normalize images | Magic-byte validation, byte/dimension limits, decode/re-encode, EXIF removed. |
| STUDY-PDF-01 | P0 | Implement PDF ingestion | PDF pages/text become Study context with page references; unsupported PDFs fail clearly. |
| STUDY-PDF-02 | P1 | Add zero-cost PDF export | Study notes/lesson print cleanly to PDF using print-first path. |

---

## P3 — Learning intelligence

| ID | Priority | Action | Exit criterion |
|---|---|---|---|
| STUDY-INT-01 | P0 | Resolve session topics to canonical concept IDs | Known topics stop living only as `session.<slug>`. |
| STUDY-INT-02 | P0 | Wire `buildStudyLearningMap` | Learner state uses verified/emerging/misconception/insufficient evidence accurately. |
| STUDY-INT-03 | P0 | Wire `buildStudyAdvisorCandidate` | Next beat uses evidence + prerequisite leverage, not only string facts. |
| STUDY-INT-04 | P1 | Remove duplicate curriculum pilot source of truth | One canonical seed path; no TS + SQL drift. |
| STUDY-INT-05 | P1 | Replace fragile string-prefix state | Versioned typed Study session state drives behavior. |

### Orphan decisions

| Capability | Decision |
|---|---|
| `buildStudyLearningMap` | Wire |
| `buildStudyAdvisorCandidate` | Wire |
| `buildStudyCurriculumBridge` | Wire later after canonical resolver |
| `normalizeStudyItemBlueprint` | Wire with P4 if assessment expansion proceeds |
| `studyItemReleaseDecision` | Wire with P4 if enforced in release workflow |
| `buildStudyCurriculumPilot2026` | Remove or make canonical; do not keep duplicate truth |
| legacy browser pass prefix | Remove after migration |

---

## P4 — Verified assessment

| ID | Priority | Action | Exit criterion |
|---|---|---|---|
| STUDY-ASSMT-01 | P0 | Create true learner E2E assessment test | Issue → answer → evidence → mastery update → next action verified against integration DB. |
| STUDY-ASSMT-02 | P1 | Expand reviewed assessment bank | Coverage grows by curriculum priority without unreviewed answer keys. |
| STUDY-ASSMT-03 | P1 | Enforce blueprint/release governance or remove it | No important governance engine remains orphaned. |

---

## P5 — Visual intelligence

| ID | Priority | Action | Exit criterion |
|---|---|---|---|
| STUDY-VIS-01 | P1 | Introduce `StudyVisualService` | Chooses SVG/graph/FBD/template/generated visual by pedagogical need. |
| STUDY-VIS-02 | P1 | Keep deterministic STEM visuals first | Physics/math geometry invariants are unit-tested; no visually plausible wrong diagrams. |
| STUDY-VIS-03 | P2 | Add realistic image generation behind budget gate | Generated visual receives minimal pedagogical context only, never the user's entire memory. |

---

## P6 — Security + reliability

| ID | Priority | Action | Exit criterion |
|---|---|---|---|
| STUDY-SEC-01 | P0 | Move Study API limits to durable shared limiter | Limits hold across Vercel instances and cold starts. |
| STUDY-SEC-02 | P1 | Restrict/proxy remote Study figures | Arbitrary tracking image hosts are not loaded without validation policy. |
| STUDY-REL-01 | P0 | Add provider-health-aware Study routing | Provider 429/timeout does not silently kill the learner turn. |

---

## Branch / PR guardrails

- Branch: `plan/study-workspace-roadmap-ux-redesign`
- Base: `main`
- PR: Draft
- This PR is **documentation only**.
- Forbidden in this PR: React/TypeScript/SQL/API changes, migrations, environment variables, deployments, Production writes, auto-merge.
- P1 implementation starts only after roadmap approval and should use a new implementation branch unless explicitly approved otherwise.
