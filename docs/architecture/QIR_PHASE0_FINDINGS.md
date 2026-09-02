# QIR Phase 0 — Execution Spine Findings

Status: **IN PROGRESS**  
Audit target: current production execution spine on `main` as of `2c19d6dc17558e120da1e8b097958785c512833b`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

This file records facts found in executable code. It is not a proposed rewrite and it does not authorize production behavior changes. Phase 0 remains an ownership and persistence audit until the exit gate in `QIR_PHASE0_TRUTH_AUDIT.md` is satisfied.

---

## 1. Executive finding

Quantora already contains several of the *concepts* required by QIR — a PCL cognitive kernel, an Outcome Contract / Proof of Done, provider-neutral agent-plan types, model routing, provider circuits, verification, repair, refinement memory and transaction tracing.

The primary architectural gap is not the absence of those organs. It is that they do **not form one executable, durable control loop**.

Today the actual hot path is still predominantly one browser-initiated `/api/chat` turn with request-local/provider-local execution. Several independent layers then classify the work, retry it, mutate artifacts, verify pieces of it, and render local notions of success/failure. The existing `agent-execution-fabric` currently produces a provider-neutral plan for metadata/governance, but its runtime registry is not wired into the production execution path.

**Phase 0 working diagnosis:** Quantora has an emerging cognition/control-plane design, but the product runtime still behaves as a collection of turn-, artifact-, provider-, and Preview-level loops rather than one durable Agent Run.

---

## 2. Confirmed current ownership matrix — checkpoint 1

| Concern | Current owner(s) observed | Durability today | Duplicate authority? | QIR disposition |
|---|---|---|---|---|
| User goal / definition of done | `api/_lib/outcome-state.ts`, project context, ephemeral `sessionContext`, `conversation-engine.ts` snapshot | Durable only when authoritative outcome/project state is actually available; otherwise reconstructed/ephemeral | Yes | **MOVE/EXPAND TO QIR RUN + PROJECT STATE** |
| Current conversational next move | `conversation-engine.ts::chooseNextConversationMove` | Request-local decision derived from snapshot | Partly — PCL assesses it separately | **KEEP AS INPUT TO COGNITION KERNEL; not run executor** |
| Cognitive governance / autonomy | `pcl-cognitive-kernel.ts` | Request-local assessment over persisted/ephemeral state | No direct executor authority | **PROMOTE INTO QIR COGNITION KERNEL** |
| Agent task decomposition | `agent-execution-fabric.ts::buildPclAgentExecutionPlan` | Request-local plan | Not executed durably | **KEEP/EVOLVE AS QIR PLAN CONTRACT** |
| Agent runtime adapter registry | `AgentRuntimeRegistry` in `agent-execution-fabric.ts` | Process-local class if instantiated | Currently unwired | **WIRE/SUPERSEDE INSIDE DURABLE RUNTIME** |
| Build/coding intent | frontend `useChatStream`, `shared/build-session.js`, `shared/build-intent.js`, backend request normalizer, backend `resolveEffectiveBuildMode` | Mostly reconstructed from current request/browser transcript/desk state | **Yes — multiple** | **QIR owns run kind/goal continuity; classifiers become signals/adapters** |
| Model selection | `selectModelsForTurn` + `planInferenceRoutes` + route health/circuits in backend | Request-local route plan with some durable/shared health data | Client also carries retry/model override behavior | **MODEL FABRIC** |
| Provider failover | backend provider loop in `chat-handler.ts`; client turn recovery can retry/switch again | Current request + browser turn state | **Yes** | **ONE QIR recovery policy; provider loop becomes step execution** |
| Turn retry | `src/lib/turn-recovery.js` + `useChatStream.js` | Browser-local; max 2 attempts | Yes, alongside server and Preview loops | **QIR RECOVERY POLICY** |
| Artifact refinement retry | `shared/refinement-loop.js` + `LivePreviewCanvas` | Browser refs/state for current Preview | Separate from turn retry | **QIR candidate-artifact loop** |
| Preview/runtime healing | `LivePreviewCanvas.jsx`, `ProjectRuntimePreview.jsx` | Browser/component-local | Separate retry/status authority | **TOOL EVIDENCE ONLY; QIR owns run state** |
| Coding turn proof | `src/lib/proof-control-plane.js::proveCodingTurn` | Deterministic over current VFS + optional live facts | Overlaps broader Proof of Done and Preview quality verification | **ADAPTER INTO OUTCOME ENGINE** |
| Universal Proof of Done | `api/_lib/outcome-contract.ts::evaluateProofOfDone` | Projection over current snapshot; not a durable run executor | Yes — coding/Preview have their own proof notions | **PROMOTE TO QIR OUTCOME ENGINE CORE** |
| Artifact mutation | coding skills / `proof-control-plane` repair pass; Preview `requestRepair` path; VFS/refine helpers | Current browser/VFS state; no universal generation/checkpoint protocol | **Yes** | **CANDIDATE ARTIFACT + CHECKPOINT PROTOCOL** |
| Run budget | server `TOTAL_CHAT_BUDGET_MS=165000`; client turn deadlines 175000ms; provider attempt budgeting; refinement caps; Preview timeouts | Distributed constants, request/component local | **Yes** | **RESOURCE & BUDGET GOVERNOR** |
| Run persistence | outcome/project state persist selected knowledge; no durable `AgentRun` execution record found in current hot path | Partial semantic memory, not durable execution | n/a | **DURABLE AGENT RUNTIME** |
| Completion copy/status | conversation response verifier, Coding outcome copy, proof-control-plane, Preview `clean/failed/degraded`, UI message state | Distributed | **Yes** | **DERIVE FROM QIR RUN/OUTCOME STATE ONLY** |

This matrix is incomplete until every hot-path module and write path is inspected.

---

## 3. Finding A — the repository already has the beginnings of the QIR brain, but it is advisory rather than executable

### Confirmed

`api/_lib/pcl-cognitive-kernel.ts` already models:

- outcome alignment;
- autonomy;
- human gates;
- risk and reversibility;
- completion and evidence coverage;
- verify-before-done policy;
- stop-when-outcome-achieved policy.

`api/_lib/outcome-contract.ts` already defines a provider-neutral Outcome Contract and a `ProofOfDone` that checks goal, definition of done, material questions, safety, artifacts, evidence and explicit goal achievement.

`api/_lib/agent-execution-fabric.ts` already defines provider-neutral task decomposition, capabilities, runtime adapter types and an `AgentRuntimeRegistry`.

However, `pcl-navigator-adapter.ts` uses the generated agent plan only in **public metadata**. It does not execute the plan. Code search also shows `AgentRuntimeRegistry` and `validatePclAgentExecutionPlan` in the repository's `wiring-baseline.json` ratchet rather than on the production hot path.

### Consequence

The architecture can *describe* an agent plan without owning a durable plan → execute → observe → verify loop. This is the clearest gap between the current platform and QIR.

### Disposition

**DO NOT build a second cognition system.** QIR should promote and consolidate the existing PCL cognition/outcome concepts into executable runtime authority:

- PCL Cognitive Kernel → core policy/assessment input to QIR Cognition Kernel;
- Outcome Contract / Proof of Done → core of QIR Outcome Engine;
- Agent Execution Fabric types → seed for QIR Plan/Capability contracts;
- Agent runtime registry → wire or replace behind the durable worker/runtime boundary.

---

## 4. Finding B — the lifetime boundary is still a turn/request, not a goal/run

### Confirmed

The backend hot path has `TOTAL_CHAT_BUDGET_MS = 165_000` and provider attempts are funded from the remaining time in that request. The browser uses 175-second chat/build deadlines specifically to outlive that server budget.

`inferenceAttemptBudgetMs` improves fairness between provider attempts, but it still divides one request's remaining wall-clock budget. It does not create a durable job that can pause/resume after the request ends.

### Consequence

A long task can preserve some semantic/project state, but the actual execution loop is still fundamentally coupled to one request and browser turn. A provider timeout, request deadline or browser termination can end the active execution even when the user's goal is far from complete.

### QIR invariant

A **step** may time out. A **Run** must not be destroyed because a step/request timed out.

### Disposition

**MOVE TO DURABLE AGENT RUNTIME.** `/api/chat` eventually becomes an interaction/control surface, not the lifetime owner of autonomous work.

---

## 5. Finding C — build intent / continuation has multiple authorities

### Confirmed

The same architectural fact is currently derived in several places:

1. `useChatStream` determines `buildSessionActive` and `isCodingRequest`.
2. `shared/build-session.js` derives whether a session remains a build from prior messages, desk-open state and file presence.
3. `shared/build-intent.js` classifies the current text and defines `resolveEffectiveBuildMode`.
4. `request-normalizer.ts` recomputes `buildMode` from request fields + `detectBuildIntent` + refine state.
5. `chat-handler.ts` computes an effective build mode again before routing/prompting.

`build-session.js` exists precisely because classifying every turn from scratch caused build conversations to fall back into chat.

### Consequence

Build continuity is a derived heuristic instead of a durable property of a goal/run. This is why short natural follow-ups can be sensitive to UI state, desk state and classifier wording.

### Disposition

**MOVE RUN CONTINUITY TO QIR.** Intent classifiers remain useful for starting/routing a run, but once a run owns a goal, later turns should address that run unless the user explicitly changes/pauses/closes the goal.

---

## 6. Finding D — recovery policy is fragmented across at least four loops

### Confirmed recovery owners

1. **Backend inference loop** — route attempts, provider/quota failure handling, circuit recording and failover.
2. **Client turn recovery** — `resolveTurnRecovery` permits another browser-level turn attempt and can switch model or strengthen the brief.
3. **Artifact refinement loop** — `shared/refinement-loop.js` tracks score progress, no-change, plateau and round budget.
4. **Preview/runtime heal loop** — `LivePreviewCanvas` can repair runtime/quality failures and has its own attempt cap and status transitions.

These loops are individually thoughtful, but each sees only its local failure domain.

### Consequence

There is no single ledger answering:

- what has already been attempted across all loops;
- how much recovery budget remains;
- whether a provider fallback followed an artifact repair;
- what the last verified checkpoint was;
- which failure class should determine the next action globally.

### Disposition

**ONE QIR RECOVERY STATE MACHINE.** Local modules return structured failures/evidence; QIR decides whether to retry, switch model, invoke a repair tool, roll back, wait, ask the user or terminate.

---

## 7. Finding E — completion/proof is already strong in pieces, but there are multiple meanings of “done”

### Existing proof systems

- `outcome-contract.ts::evaluateProofOfDone` — mission-level, provider-neutral proof.
- `proof-control-plane.js::proveCodingTurn` — coding-turn/VFS proof.
- `verify-build.ts` — artifact quality verification.
- `ProjectRuntimePreview` — compile/runtime terminal ready/failed evidence.
- `LivePreviewCanvas` — local `running/healing/clean/degraded/failed` state and quality/refinement behavior.
- conversation response verification — rejects prose that claims Done without PCL proof.

### Important nuance

The PCL Proof of Done is the correct architectural direction, but today it mainly governs conversation state/prompting/response verification. It is not yet the sovereign executor that waits for all required tool/runtime evidence before completing a durable run.

`LivePreviewCanvas` also marks a Preview `clean` on runtime trust/load paths before/while an optional quality check can continue, which is valid as a **local render state** but must never be confused with mission completion.

### Disposition

**ONE OUTCOME ENGINE; MANY EVIDENCE ADAPTERS.** Coding proof, compiler/runtime proof, research verification, travel freshness, document validation, 3D/simulation validation etc. become evidence/check adapters. Only the QIR Outcome Engine can transition a run to `COMPLETE`.

---

## 8. Finding F — artifact repair is not yet a universal candidate/promote protocol

### Confirmed

`proof-control-plane.js` can create a modified VFS during deterministic repair. `LivePreviewCanvas` can accept model repair output and set it as current code when local guards pass. These are useful protections, but they do not share a universal durable artifact-generation/checkpoint identity.

### Consequence

A repair can be locally safe without being represented as:

`last verified artifact → candidate generation → verifier → promote/reject → durable checkpoint`.

For long-running coding, 3D, document, agent and engineering tasks, that candidate/promote history is essential for rollback and cross-worker continuation.

### Disposition

**QIR ARTIFACT VERSION + CHECKPOINT PROTOCOL.** Existing repair helpers become operations on candidate artifacts; they no longer own promotion.

---

## 9. Finding G — budgets are distributed constants, not a Resource Governor

### Confirmed budget authorities

- server whole-turn wall-clock budget;
- client request deadline;
- provider attempt allocation;
- provider circuits/quota-domain skips;
- coding turn attempt count;
- refinement round count / score plateau rules;
- Preview compile/render/shell timers;
- paid-route spend gate / usage recording elsewhere in the backend.

### Consequence

The platform can bound individual mechanisms but cannot yet answer one universal question:

> “How much plan allowance, run budget, step budget, recovery reserve, premium escalation capacity and tool/GPU compute remain for this user's goal?”

### Disposition

**RESOURCE & BUDGET GOVERNOR.** Existing per-mechanism limits remain safety inputs, but QIR owns the durable budget envelope and reserves recovery capacity explicitly.

---

## 10. Persistence gaps confirmed so far

The following execution state is not yet represented by one durable Agent Run record:

- current execution phase and next executable step;
- complete attempt history across model, tool, repair and verifier layers;
- selected/failed routes for the run;
- structured failure class and unresolved diagnosis;
- last verified artifact checkpoint and candidate generation;
- pending tool invocation / resumable wait;
- Preview/runtime evidence tied to artifact generation;
- refinement history across browser/process loss;
- remaining run/recovery/premium budgets;
- explicit `WAITING_FOR_USER` / `WAITING_FOR_CAPACITY` continuation state;
- a replayable event ledger sufficient for another worker to resume execution.

Existing Outcome State and Project Context are valuable semantic memory and should be preserved, but they are not substitutes for a durable execution journal.

---

## 11. Existing assets to preserve — no rewrite

Phase 0 currently classifies these as **preserve and migrate behind QIR**, subject to deeper audit:

- `pcl-cognitive-kernel.ts`;
- `outcome-contract.ts`;
- cognitive ledger + authoritative project/outcome state;
- useful types/plan logic from `agent-execution-fabric.ts`;
- model registry and model-quality signals;
- `inference-control-plane.ts` route/capability/circuit logic;
- provider resilience/circuit stores;
- paid-route/spend controls;
- `verify-build.ts`;
- `repair.ts`;
- `shared/refinement-loop.js` stopping/memory rules;
- build truth / deterministic proof checks;
- VFS/compiler/Preview runtime;
- transaction/correlation tracing;
- Travel, Study, Finance and Research specialist capabilities;
- existing security/safety controls and meaningful release gates.

The goal is to **remove duplicate authority**, not discard working capability.

---

## 12. First target architecture mapping

| Current component | QIR role |
|---|---|
| `pcl-cognitive-kernel.ts` | Cognition Kernel policy/assessment core |
| `conversation-engine.ts` | conversational decision adapter; contributes candidate next moves |
| `outcome-state.ts` / project context | semantic/project memory input; not the Agent Run journal |
| `outcome-contract.ts` | Outcome Engine foundation |
| `agent-execution-fabric.ts` task/capability types | Plan + capability contract foundation |
| `AgentRuntimeRegistry` | durable runtime/tool/model adapter seam after redesign/wiring |
| `selectModelsForTurn` + inference control plane | Model Fabric router |
| provider loop in `chat-handler.ts` | model-execution activity/tool under QIR |
| `turn-recovery.js` | diagnosis/recovery rules to absorb into universal recovery policy |
| `proof-control-plane.js` | coding evidence adapter; local deterministic fixes become candidate operations |
| `verify-build.ts` | software artifact verifier adapter |
| `repair.ts` | repair tool |
| `refinement-loop.js` | evidence-based stopping primitive used by QIR recovery governor |
| Preview compiler/runtime | execution + runtime evidence tools |
| Preview `clean/degraded/failed` | local evidence state derived into QIR, never mission completion |

---

## 13. Remaining Phase 0 work before any runtime migration

This checkpoint is **not Phase 0 completion**. Next inspection passes must still map:

1. the complete `useChatStream` send/stream/retry/VFS/response lifecycle;
2. `AiStudio` / Coding Desk ownership of VFS, job state, proof and UI completion;
3. Outcome State and Project State **write** paths, versioning and browser refresh behavior;
4. all artifact parsers/mutators and every path that can replace current VFS/code;
5. all provider adapter calls, timeouts, token/output limits, usage/spend accounting and failure normalization;
6. all tool/API execution paths and whether they have typed evidence/error contracts;
7. every `ready/done/complete/success/clean/verified/finished` claimant in executable code;
8. existing transaction tracing coverage and gaps needed for a replayable run event ledger;
9. all golden/browser gates to identify which stop at partial success rather than verified outcomes;
10. open reliability PRs against this architecture so symptom fixes are either retained as universal invariants or retired.

Only after those passes can Phase 0 produce the final `KEEP / MOVE / ADAPTER / DERIVE / DELETE` disposition for every execution-spine authority.

---

## 14. Phase 0 decision at checkpoint 1

**No production behavior change is authorized from this checkpoint.**

The strongest architectural conclusion so far is:

> Quantora should not invent a new brain beside PCL. It should turn the existing PCL cognition/outcome concepts into the sovereign, durable QIR control loop, and move today's request-, client-, provider-, artifact- and Preview-level loops underneath it as bounded execution/evidence mechanisms.

That is the current surgical direction.