# Quantora Study Workspace — Action Roadmap

> Isolated Draft PR only. No Main merge, Production deployment, DB migration, environment change, or pricing change is authorised by this branch.

## North Star

**Conversation first.** Cards and chips introduce the next learning move; they do not become permanent dashboards that hide the lesson.

## Delivery pipeline

| Phase | Work | Exit gate |
|---|---|---|
| P1 | Conversation-first UX | Compact focus shell, closable activities, compact Study action palette, existing assessment flow passes. |
| P2 | Attachments + PDF | Clipboard image, image/file hygiene, PDF ingest and print-to-PDF work end-to-end. |
| P3 | Learning intelligence | Canonical concepts + learning map + advisor candidate wired; Study orphans reduced. |
| P4 | Verified assessment | Issue → answer → evidence → mastery → next action passes a real integration test. |
| P5 | Visual intelligence | Deterministic STEM first; generated visuals only when pedagogically useful and budget-authorised. |
| P6 | Reliability/security | Durable rate limits, provider failover, media trust and production observability. |

---

## P1 — UX implementation now in this Draft PR

### Default Study surface

- One compact **Focus shell** instead of the giant permanent Tutor Board.
- Topic + honest state + next move stay visible.
- Only **Explain / Practice / Check** are primary actions.
- **More** opens the existing advanced Tutor Board on demand.
- **Close** collapses Study focus to a single reopen chip.
- Practice/checks open as small inline activity cards and can be closed.
- The large visual/FBD no longer owns the default screen; it remains available in expanded detail.

### `This Topic` redesign

- Replace tall navigation-card treatment with a compact **Study action palette**.
- ~292 px wide; two-column action grid.
- New Topic remains full-width.
- Explain / Flashcards / Quiz / Icebreaker become concise action tiles.
- Explicit close button.
- Palette closes immediately after an action is selected.
- No decorative radio circles and no long subtitle stack blocking the conversation.

### P1 acceptance gates

- Conversation remains the dominant surface.
- Compact default Study chrome stays close to one message-row height before wrapping.
- Maximum 3 primary learning actions; `More` is secondary navigation.
- Every expanded activity has a close/collapse control.
- Existing verified-assessment semantics remain intact: self-confidence is not mastery.
- Study browser gate, typecheck, build and wiring gate must be green before merge is considered.

---

## Study AI model policy — proposed next backend slice

### Finding

Study currently inherits the generic model-selection path. The selector does **not receive `studioDomain`**, so ordinary Study turns can be ranked like generic free-model traffic. That is commercially attractive on paper but not reliable enough: free OpenRouter endpoints have already produced 429s/timeouts in production.

### Target routing

| Study workload | Primary | Fallback | Escalation |
|---|---|---|---|
| Normal text tutoring | **DeepSeek V4 Flash 0731** | Gemini Flash | GPT-5.6 Luna |
| Screenshot / image question | **Gemini Flash** | declared vision-capable route | GPT-5.6 Luna where capability permits |
| Explicit Deep Think / hard derivation | **GPT-5.6 Luna** | DeepSeek V4 Flash | Gemini Flash |
| Premium rescue | spend-gated only | Claude Sonnet only when justified | BYOK for repeated premium use |

### Commercial rule

- **Do not make free Nemotron/GPT-OSS endpoints the Study primary.** They may be opportunistic, never the reliability foundation.
- Prefer DeepSeek V4 Flash for normal text: strong long-context/tool capability at very low OpenRouter cost.
- Use Gemini deliberately for vision and as a different-provider failure domain; do not burn the paid Google allowance on every text turn.
- Use Luna only when the task deserves a stronger reasoning rung.
- Claude is rescue, not normal Study traffic.
- User-facing UX should remain **Auto / Fast / Deep**, not a hotel menu of model brands.

### STUDY-MODEL-01 implementation gate

Do **not** add an unwired Study routing helper. The proper change is to pass the normalized Study domain into the authoritative model selector, add domain-aware routing tests, and preserve explicit user model selection. Ship this as a separate backend-focused change after the P1 UX branch is green.

---

## P2 — Attachments + PDF

| ID | Priority | Action | Done when |
|---|---|---|---|
| STUDY-MEDIA-01 | P0 | Clipboard image paste | Cmd/Ctrl+V screenshot previews and sends correctly. |
| STUDY-MEDIA-02 | P0 | One attachment control | Image/PDF selection is obvious; duplicate attachment affordances removed. |
| STUDY-MEDIA-03 | P0 | Media hygiene | Magic bytes, size/dimension limits, decode/re-encode and EXIF stripping. |
| STUDY-PDF-01 | P0 | PDF ingestion | Extracted text/pages become Study context with page references. |
| STUDY-PDF-02 | P1 | PDF export | Clean print stylesheet supports browser Save as PDF at near-zero platform cost. |

## P3 — Learning intelligence

| ID | Priority | Action |
|---|---|---|
| STUDY-INT-01 | P0 | Resolve known topics to canonical concept IDs. |
| STUDY-INT-02 | P0 | Wire `buildStudyLearningMap`. |
| STUDY-INT-03 | P0 | Wire `buildStudyAdvisorCandidate`. |
| STUDY-INT-04 | P1 | Remove duplicate curriculum seed truth. |
| STUDY-INT-05 | P1 | Replace string-prefix session state with versioned typed Study state. |

## P4 — Verified assessments

- Real integration test: issue → answer → evidence → mastery → next action.
- Expand reviewed item bank by curriculum priority.
- Wire assessment blueprint/release governance or delete the unused path.

## P5 — Visual intelligence

- Deterministic graph/FBD/geometry first.
- Unit-test scientific geometry/invariants.
- Generated realistic/full-body visuals only when the lesson needs them and the budget gate approves them.
- Send the image model only minimal pedagogical context, never the learner's entire memory.

## P6 — Reliability and security

- Durable shared limiter for Study APIs.
- Restrict/proxy remote Study figures.
- Provider-health-aware Study routing.
- Keep global AI spend protection above all workspace entitlements.

---

## Branch / PR guardrails

- Branch: `plan/study-workspace-roadmap-ux-redesign`
- PR: Draft #359
- Base: `main`
- Current authorised code scope: **P1 Study UX only**.
- Not authorised here: DB/SQL, PDF backend, image generation, model-router backend changes, provider keys, Production deployment or merge.
- Main and Production remain untouched until CI + preview review + explicit approval.
