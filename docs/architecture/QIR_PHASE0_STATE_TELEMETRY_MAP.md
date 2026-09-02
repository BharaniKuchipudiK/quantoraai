# QIR Phase 0 — State, Retention and Telemetry Map

Status: **IN PROGRESS**  
Audit target: production execution spine on `main` at `2c19d6dc17558e120da1e8b097958785c512833b`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

This is a behavior-neutral audit. It maps the state Quantora already keeps, what survives a browser/process/request failure, what is optional semantic memory versus operational state, and which current telemetry can seed QIR Step/Attempt records.

---

## 1. Executive finding

Quantora has several durable stores, but **none is the durable Agent Run journal**.

Current state falls into at least six distinct classes:

1. browser conversation/workspace state;
2. project semantic state;
3. consented Outcome/PCL semantic memory;
4. account-level user-context graph;
5. provider/model operational telemetry and circuit state;
6. domain evidence/state such as Study mastery.

The missing seventh class is the QIR runtime ledger:

> a durable, owner-scoped record of the active goal's execution plan, steps, attempts, observations, failures, checkpoints, pending gates and budgets.

Trying to repurpose any one existing store for that job would mix retention, consent and correctness semantics that are currently deliberately different.

---

## 2. Browser conversation/session state — valuable UX state, not durable runtime state

### Current authority

`src/hooks/useStudioSession.js` persists the browser's Studio sessions under `quantora_chat_sessions` and local projects under `quantora_projects_v1`.

The session object can carry conversation messages, domain/mode, conversation context and a desk snapshot. The persistence layer contains substantial reliability work:

- corrupt session blobs are backed up before replacement;
- write/quota faults are surfaced to the UI;
- superseded build code is compacted before saving;
- on browser quota pressure, old desk snapshots are shed before irreplaceable chat history;
- a handover session copies the desk so switching conversations does not lose the build.

### Durability boundary

This state is **origin/browser local**. It does not make the active execution restart-safe across another device, cleared browser storage, worker/process loss or a server-side durable workflow handoff.

### QIR disposition

**KEEP for client UX/cache, DERIVE from QIR where execution state matters.**

The browser may cache/replay Run events and artifact previews, but it must not be the authority for:

- current run state;
- retry count;
- next executable step;
- recovery reserve;
- last verified checkpoint;
- pending approval/question;
- completion.

---

## 3. Coding Desk local checkpoints — strong semantics, wrong persistence lifetime

`desk-checkpoints.js` keeps bounded in-memory VFS snapshots for rewind. `AiStudio.commitDeskVfs(...)` records an accepted snapshot and blocks a broken/truncated candidate from replacing a working page.

This is excellent local mutation safety, but the checkpoint history is deliberately **in-memory only** and disappears with the browser session.

### QIR disposition

**KEEP the checkpoint semantics; MOVE checkpoint identity/history to durable Artifact/Run storage.**

The browser can keep a cache for instant rewind, but every promoted artifact generation must be reconstructable from durable state.

---

## 4. Project State — durable semantic/project continuity

### Current authority

Project State persists owner-scoped project records and links project resources/sessions. The project API supports:

- list;
- versioned save with optimistic conflict detection;
- delete;
- resource sync;
- session-id sync;
- context read.

The Project Context Pack can synthesize useful semantic context from project metadata, resources and linked Outcome States.

### What it is not

It does not persist the complete live execution machine:

- no ordered model/tool attempt ledger;
- no current executing step;
- no pending tool invocation;
- no failure diagnosis/recovery state;
- no run-level budget/reserve;
- no artifact candidate/promotion chain sufficient for worker resume.

### QIR disposition

**KEEP as Project Memory.** Agent Runs reference a project; they do not become the project row.

---

## 5. Outcome State / Cognitive Ledger — consented semantic memory and governance evidence

### Current authority

Outcome State is owner + session scoped and uses optimistic versioning. Server-side reconciliation preserves the Cognitive Ledger. Client continuity writes are gated on explicit session memory consent.

The state is deliberately semantic:

- goal;
- understanding;
- definition of done;
- constraints/assumptions;
- open questions;
- decisions;
- artifacts;
- next actions;
- Cognitive Ledger;
- safety/memory state.

PCL side-effect authorization can record exact user approvals and execution evidence in this ledger when durable Outcome Memory is enabled.

### Critical retention boundary

Outcome Memory is **optional/consented personal semantic memory**.

A durable Agent Run is **necessary operational state for work the user asked Quantora to execute**.

These cannot be the same retention contract. Otherwise turning off personal memory would also make reliable execution impossible, or reliable execution would secretly persist personal memory the user declined.

### QIR disposition

**KEEP as semantic/governance memory.** A Run may reference or project selected state into Outcome Memory according to policy/consent, but its operational journal has a separate lifecycle.

---

## 6. User Context Graph — account-level structured context

### Current authority

`user-context-store.ts` stores owner-scoped active context nodes with:

- category/key/value;
- provenance;
- confidence;
- source reference;
- validity window;
- status.

Trusted server tools such as Finance profile commands append nodes using the authenticated session subject, not a browser-supplied account id.

### QIR disposition

**KEEP as User Memory / connected-source context.** It can feed Cognition/working context. It must not carry Run mechanics such as retries, tool continuation or checkpoint cursors.

---

## 7. Provider circuit state — durable/shared operational health, not run history

### Current authority

`SharedProviderCircuitStore` persists provider-circuit state in Supabase when reachable and falls back to an explicit local-degraded mode when the shared store is unavailable.

Stored facts include:

- failure count;
- opened-until;
- last failure time;
- last success time.

This is shared fleet-level provider health and is already used by inference routing and Travel/provider resilience.

### QIR disposition

**KEEP as Model/Tool Fabric health input.**

A Run should record that *its* attempt encountered an open circuit/timeout/failure, but provider circuit state itself remains shared operational infrastructure rather than copied into every Run.

---

## 8. Usage telemetry — useful but insufficient for Resource Governor accounting

### Current authority

`recordUsage(...)` writes one row per AI request with:

- provider;
- model id;
- latency;
- estimated tokens;
- whether a server key paid for the call;
- Studio mode/domain;
- selected-choice signal;
- coarse geography when available.

Current `tokens_est` is computed from output text length (`ceil(textLength / 4)`), not actual provider prompt/completion usage.

Separately, the paid OpenRouter route gate reads the provider's own account usage/limit because the streaming path does not currently capture exact prompt/completion tokens.

### Retention

Operational telemetry has a 30-day purge path. Usage/product/suggestion telemetry intentionally stores no prompt/response bodies.

### QIR disposition

**KEEP the privacy-minimized analytics stream, but do not use it as the Run budget ledger.**

QIR needs structured Step usage when providers/tools make it available:

- input tokens;
- output tokens;
- cache tokens where relevant;
- provider-billed cost or authoritative provider meter reference;
- wall-clock/compute time;
- tool/GPU/browser consumption;
- whether usage came from server, BYOK or plan capacity.

When exact usage is unavailable, mark it estimated/unknown rather than silently converting an output-length estimate into billing truth.

---

## 9. Model quality telemetry — routing evidence, currently turn-level

### Current authority

`model_quality_events` stores anonymous operational outcomes:

- `success`;
- `failure`;
- `helpful`;
- `not_helpful`;
- latency;
- fallback origin;
- task category.

No prompt, response, account id, API key or IP is stored in that table.

`shared/model-outcome-routing.js` converts accumulated per-model/task outcomes into reliability/usefulness scores and feeds those measured signals back into model routing.

This is valuable adaptive-routing infrastructure.

### QIR semantic correction

The word **outcome** here means *model/turn outcome*, not *user mission outcome*.

Under QIR, retain this signal but attach it to the correct level:

- Model Attempt succeeded/failed;
- Step verification passed/failed;
- user marked final response helpful/not helpful;
- mission Outcome Engine verified/not verified.

Those must be separate fields/events. A model that streamed valid text may have a successful attempt even if the artifact later fails verification; conversely a failed primary attempt may be followed by a successful fallback and a verified mission.

### QIR disposition

**KEEP/EVOLVE into Attempt/Step quality evidence.** Do not let request-level `success` masquerade as Agent Run completion.

---

## 10. Product/suggestion/published-site telemetry — useful secondary records

Current store also includes:

- product events such as Preview opened / publish completed;
- suggestion shown/accepted/dismissed;
- published-site ownership needed for privileged domain mutations.

These are operational/product/authorization records, not execution state.

### QIR disposition

- published-site ownership -> **KEEP as authorization/resource metadata**;
- product/suggestion events -> **KEEP as analytics**;
- selected events may reference a Run id/correlation id in future for evaluation, but they do not become the Run journal.

---

## 11. Study evidence and mastery — durable domain evidence

Study already persists domain evidence separate from conversational claims:

- issued assessment attempts;
- graded attempts;
- mastery evidence events;
- self-confidence signals explicitly prevented from becoming correctness/mastery proof;
- mastery estimates.

This is exactly the separation QIR needs: durable domain evidence can outlive a turn without becoming the universal runtime itself.

### QIR disposition

**KEEP as Study Domain Evidence Store.** QIR references its evidence ids/checks when evaluating Study Outcome Contracts.

---

## 12. State authority matrix

| State class | Current lifetime | Current owner | QIR role |
|---|---|---|---|
| Studio chat/session/desk cache | browser localStorage | `useStudioSession` / UI | client cache + UX state |
| desk rewind history | component/in-memory | Coding Desk | durable artifact checkpoints after migration |
| build job | component/browser state | AiStudio/build-job | Run plan/step projection after migration |
| Project State | durable Supabase | Project Store | Project Memory |
| Outcome State / Cognitive Ledger | durable when consented | Outcome Store/PCL | semantic memory + governance evidence |
| User Context Graph | durable Supabase | User Context Store | User/connected-source memory |
| provider circuits | shared durable with local fallback | Model/Tool resilience | provider-health input |
| usage telemetry | durable short-retention | operational analytics | analytics + partial usage evidence |
| model quality events | durable operational | model routing | Attempt/Step quality evidence |
| published-site ownership | durable operational | publish/store | external-resource authorization metadata |
| Study mastery/evidence | durable domain store | Study runtime | domain evidence |
| **Agent Run journal** | **MISSING** | **none** | **new durable runtime authority** |

---

## 13. Minimum durable Agent Run state implied by the gaps

Phase 0 does not implement this schema, but the current-state audit establishes the minimum facts a new run store must represent:

```ts
interface AgentRunJournal {
  runId: string;
  userSub: string;
  projectId?: string | null;
  sourceSessionId?: string | null;

  goalRef: string;
  status: RunStatus;
  version: number;

  plan: PlanSnapshot;
  currentStepId?: string | null;
  attempts: AttemptRef[];
  observations: ObservationRef[];
  failures: FailureRef[];

  currentArtifactGeneration?: string | null;
  lastVerifiedCheckpoint?: string | null;

  pendingHumanGate?: HumanGate | null;
  pendingUserQuestion?: string | null;

  budget: ResourceBudgetSnapshot;
  recovery: RecoveryState;

  eventCursor: number;
  createdAt: string;
  updatedAt: string;
}
```

### Non-negotiable persistence properties

- owner scoped;
- optimistic/transactional state transitions;
- idempotent step/tool execution keys;
- append-only/replayable event history for diagnosis;
- secret-free observations;
- artifact/evidence references instead of giant duplicated payloads;
- explicit retention/expiry policy;
- included in user data-control policy where applicable;
- resumable by another compatible worker without browser history replay.

---

## 14. Telemetry -> QIR event mapping

| Current signal | QIR event/record |
|---|---|
| `/api/chat` correlation id | `run/step/attempt correlation` |
| model route start | `model.attempt.started` |
| model quality success/failure | `model.attempt.completed/failed` + quality evidence |
| fallback origin | `model.route.switched` |
| provider timeout/circuit | `model/tool.attempt.failed` with normalized failure |
| Travel tool execution | `tool.started` / `tool.completed` |
| Coding VFS accepted | `artifact.candidate.created` then promotion after verifier |
| compile/Preview state | `verification.observation` |
| Office verifier result | `artifact.verification.completed` |
| Research/Study verifier result | `verification.completed` |
| PCL side-effect approval | `human.approval.recorded` |
| provider execution evidence | `tool.side_effect.confirmed` |
| browser Stop | `run.pause/cancel requested` depending explicit semantics |
| budget/capacity exhaustion | `run.waiting_for_capacity` |
| Outcome Engine pass | `run.completed` |

This mapping preserves existing telemetry value while removing the ambiguity around the word `success`.

---

## 15. Privacy/retention requirement for QIR

Existing code already makes useful distinctions:

- optional Outcome Memory requires consent;
- model-quality telemetry stores no prompt/account identity;
- usage/product telemetry is purged after 30 days;
- user data export/delete exists for account-scoped records;
- provider circuits are infrastructure health, not personal history.

QIR must make the same distinction explicitly:

### Operational Run State

Persist only what is necessary to execute, resume, diagnose and prove the requested work. Set a defined retention window after completion/cancellation unless a project/archive policy explicitly retains selected artifacts/checkpoints.

### Optional Personal/Semantic Memory

Continue to respect explicit user memory policy/consent. Do not silently promote the full Run journal into long-lived personal memory.

### Analytics

Prefer derived, privacy-minimized metrics over raw Run content.

---

## 16. Phase 0 decisions strengthened by this pass

1. **Agent Run persistence needs a new dedicated authority.** Existing semantic/analytics stores should not be overloaded.
2. **Browser session state becomes a cache/view, not execution truth.**
3. **Outcome Memory consent must remain independent of operational durability.**
4. **Measured model quality should survive**, but be renamed/typed at Attempt/Step level so it cannot be confused with mission success.
5. **Provider circuits remain shared infrastructure state.**
6. **Study evidence remains domain evidence.**
7. **Exact usage must be distinguished from estimates.** Resource governance cannot treat `textLength/4` as authoritative provider token accounting.
8. **Run data needs explicit export/delete/retention rules before Phase 1 production use.**

---

## 17. Remaining Phase 0 work

- finish executable completion-claim inventory;
- finish consequential side-effect inventory;
- inspect release/golden transactions and classify which prove component health versus goal/outcome success;
- final KEEP / MOVE / WRAP / DERIVE / DELETE table;
- close all twelve Phase 0 exit questions with evidence.
