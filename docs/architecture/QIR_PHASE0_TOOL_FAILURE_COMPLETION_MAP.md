# QIR Phase 0 — Tool, Failure and Completion Authority Map

Status: **IN PROGRESS**  
Audit target: production execution spine on `main` at `2c19d6dc17558e120da1e8b097958785c512833b`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

This document is a factual Phase 0 audit artifact. It does **not** change production behavior. Its purpose is to identify who currently invokes tools, who owns recovery, how raw failures are represented, and which modules can currently emit or infer `success / ready / clean / complete / verified`.

---

## 1. Executive finding

Quantora does not yet have one universal Tool Runtime or one universal failure envelope.

The strongest current tool path is Travel. It already has several good properties — typed declarations, argument validation, provider-backed results, circuit breakers, bounded retries, explicit no-mock behavior and fail-closed transactional actions. However, the execution authority still lives inside the request-scoped chat path:

`model function call -> chat-handler agent loop -> executeToolCall -> provider adapter -> result -> same chat request`

That means tool invocation, provider retry/fallback, pause/ask behavior and parts of recovery are still local to one HTTP turn rather than one durable Agent Run.

Likewise, Quantora already has strong local proof concepts, but there are multiple meanings of success:

- provider/tool call succeeded;
- file step exists;
- Coding proof passed;
- Preview compiled/rendered cleanly;
- Office artifact envelope verified;
- mission-level Proof of Done verified.

Only the final category is allowed to become QIR `COMPLETE`. All others are evidence.

---

## 2. Current Tool execution path — confirmed

### 2.1 Travel tools are the clearest production tool runtime today

`api/_lib/chat-handler.ts` imports `travelFunctionDeclarations` and `executeToolCall` from `agent-tools.ts` and runs a bounded model/tool loop (`MAX_AGENT_STEPS = 5`). When Gemini emits a signed function call, `chat-handler`:

1. records a tool-running SSE status;
2. invokes `executeToolCall(...)` directly;
3. passes the result back into the Gemini continuation;
4. can stop, retry, or pause/ask depending on the tool result;
5. remains inside the same request/turn budget.

This is a real agent loop, but it is **request-local and domain-local**, not the QIR Durable Agent Runtime.

**QIR disposition:** `ADAPTER` + `MOVE EXECUTION AUTHORITY TO QIR`.

Preserve the Travel provider adapters and contracts; move orchestration, durable state, cross-tool recovery and continuation into the universal runtime.

### 2.2 The current `AgentRuntimeRegistry` is not this runtime

`api/_lib/agent-execution-fabric.ts` defines provider-neutral runtime adapter types and `AgentRuntimeRegistry`, but the production Travel path above does not execute through that registry. The current registry remains an architectural seam/seed, not production tool authority.

**QIR disposition:** `KEEP CONTRACT IDEA`, then either wire or supersede it behind the durable runtime boundary.

### 2.3 Travel tool adapter already contains valuable safety and resilience logic

`api/_lib/agent-tools.ts` currently owns several concerns that should survive migration:

- model-authored argument validation;
- provider-specific normalization;
- bounded provider retry policy;
- provider circuit integration;
- alternate Duffel credential fallback for flight search;
- deterministic clarification instead of guessing;
- no-result handling;
- provider refusal vs transient provider failure distinction;
- mandatory provider-backed shortlist formatting for hotel results.

These are **tool adapter responsibilities**, not reasons to keep orchestration inside `chat-handler`.

### 2.4 Transactional Travel actions correctly fail closed

`agent-tools-core.ts` recognizes transactional names such as reservation/booking/price-alert operations, but they are deliberately not exposed as active model tools and `executeToolCall` refuses them in production. No booking, purchase, ticket, alert, monitoring job or reservation may be fabricated.

This is exactly the right architectural boundary for QIR: consequential actions require explicit authorization plus provider-confirmed evidence before success can be reported.

**QIR disposition:** `KEEP SAFETY LAW`; future transaction tools plug into QIR human gates + evidence protocol.

---

## 3. Duplicate recovery authority — tool path

The Travel path confirms another duplicate-authority cluster.

### Layer A — provider resilience

`api/_lib/provider-resilience.ts` owns:

- per-operation deadline;
- retryable HTTP statuses;
- bounded provider attempts;
- backoff;
- circuit opening/reset;
- `ProviderTimeoutError`;
- `ProviderCircuitOpenError`.

This is a strong low-level provider primitive.

### Layer B — Travel adapter recovery

`agent-tools.ts` can:

- retry Duffel;
- switch to a fallback Duffel credential;
- convert invalid/missing arguments into `PAUSE_AND_ASK`;
- decide whether a provider refusal is retryable;
- convert empty hotel results into a user-facing recovery state;
- request a turn-level retry for selected flight failures.

### Layer C — `chat-handler` tool loop

`chat-handler.ts` can inspect `PAUSE_AND_ASK`, decide whether an `autoRetryToolTurn` applies, emit tool lifecycle states, continue the model/tool loop or terminate it.

### Layer D — browser turn recovery

`src/lib/turn-recovery.js` separately owns a second attempt for selected transport/build failures and can switch the model at the browser turn level.

**Finding:** each layer is individually bounded, but there is no universal attempt ledger or recovery budget across them.

**QIR disposition:**

- `provider-resilience.ts` -> **KEEP as low-level provider primitive**;
- Travel-specific interpretation -> **KEEP inside Travel adapter as structured diagnosis/evidence**;
- global retry/pause/replan decision -> **MOVE TO QIR RECOVERY STATE MACHINE**;
- browser-level second orchestration loop -> **DELETE AFTER QIR CUTOVER**.

---

## 4. Failure-domain normalization — current -> QIR

The same underlying problem is represented today by different status codes, error classes and result shapes. QIR needs one durable structured failure envelope, for example:

```ts
interface QirFailure {
  code: string;
  domain: string;
  source: string;
  retryable: boolean;
  userActionRequired: boolean;
  evidenceRefs: string[];
  attemptId: string;
  detail?: Record<string, unknown>;
}
```

### Confirmed mapping

| Current signal | Current owner | QIR normalized class | Default recovery owner |
|---|---|---|---|
| missing/invalid material tool arguments | Travel validation / tool adapter | `USER_INPUT_REQUIRED` | Cognition Kernel -> `WAITING_FOR_USER` |
| policy/safety refusal | moderation / action gates / disabled transaction tool | `POLICY_BLOCK` | Cognition Kernel / policy |
| HTTP 401/403 provider credential rejection | chat/provider path | `PROVIDER_AUTH` | Model/Tool Fabric; no blind retry |
| HTTP 402 / provider credit | chat/provider path | `PROVIDER_QUOTA` or `CAPACITY_WAIT` | Resource Governor |
| HTTP 429 | provider path | `PROVIDER_QUOTA` / transient capacity | Runtime recovery + Resource Governor |
| `ProviderTimeoutError` | provider resilience | `PROVIDER_TIMEOUT` | Runtime recovery |
| network/fetch failure | provider/client path | `PROVIDER_TRANSPORT` | Runtime recovery |
| `ProviderCircuitOpenError` | provider resilience | `CAPACITY_WAIT` | Runtime + Model/Tool Fabric |
| `BUILD_ARTIFACT_CONTRACT` | coding turn contract | `MODEL_CONTRACT` | Runtime replan / stronger instruction / alternate model |
| Travel `INVALID_ARGUMENT` | agent-tools | `USER_INPUT_REQUIRED` | `WAITING_FOR_USER` |
| Travel `NOT_CONFIGURED` | agent-tools | `TOOL_FAILURE` with configuration detail | Capability/Tool Fabric; user/operator action |
| Travel `PROVIDER_REJECTED` | agent-tools | `TOOL_FAILURE` non-retryable | Capability/Tool Fabric |
| Travel `PROVIDER_ERROR` | agent-tools | `TOOL_FAILURE` retryable when diagnosis permits | Runtime recovery |
| Travel `NO_RESULTS` | agent-tools | tool observation, **not necessarily failure** | Cognition Kernel chooses alternate query / asks user |
| Preview compile HTTP failure | preview compile client | `COMPILE_FAILURE` | Runtime candidate-artifact recovery |
| Preview compile deadline | preview compile client | `TOOL_TIMEOUT` / `COMPILE_FAILURE` | Runtime recovery |
| Preview runtime error/no-ready | Preview runtime | `RUNTIME_FAILURE` | Runtime candidate-artifact recovery |
| verifier rejects artifact | proof/verify-build/outcome verifier | `VERIFICATION_FAILURE` | Runtime repair/replan |
| request/run allowance exhausted | current turn clocks / future governor | `BUDGET_WAIT` | Resource Governor -> checkpoint/wait |
| invariant impossible state | guards / future runtime | `INTERNAL_INVARIANT` | fail safe + operator evidence |

### Important distinction

`NO_RESULTS`, `unavailable`, `failed`, and `not complete` are not synonyms.

Example: a real provider returning zero matching hotels is an **observation**. The next action may be widen the search, change location, ask the user, or finish with “none found.” Treating every empty result as a terminal failure would make the new runtime as brittle as the old one.

---

## 5. Completion-authority inventory — checkpoint

### 5.1 Mission-level authority — preserve and promote

`api/_lib/outcome-contract.ts::evaluateProofOfDone(...)`

This is currently the closest thing to the correct sovereign completion contract. It checks:

- mission/goal exists;
- definition of done exists;
- criteria are confirmed;
- material questions are resolved;
- safety flags are resolved;
- produced artifacts are verified;
- evidence exists;
- goal is explicitly achieved.

`conversation-engine.ts` already rejects assistant prose that claims Done when this proof is not verified.

**QIR disposition:** `PROMOTE TO OUTCOME ENGINE CORE`.

### 5.2 Coding proof — local evidence, not mission completion

`src/lib/proof-control-plane.js::proveCodingTurn(...)` and `codingTurnMayClaimSuccess(...)` judge whether a coding turn has enough structural/desk evidence to be treated as a successful coding turn.

This is useful, but “coding turn passed” is not equivalent to “user goal complete.”

**QIR disposition:** `ADAPTER -> SOFTWARE OUTCOME EVIDENCE`.

### 5.3 Build-job completion — local plan-step evidence

`src/lib/build-job.js::buildJobIsComplete(...)` returns complete only when every planned step's promised files exist with content. This is a strong anti-assertion primitive.

However, file presence alone does not prove compile/runtime/behavior/quality.

**QIR disposition:** `KEEP AS PLAN STEP EVIDENCE`, enrich step contracts under QIR.

### 5.4 Preview ready/clean — runtime evidence only

`ProjectRuntimePreview` emits `compiling / ready / failed`; `LivePreviewCanvas` maintains `running / healing / clean / degraded / failed`.

These are valid runtime states. They must not independently transition the user's Agent Run to complete.

**QIR disposition:** `DERIVE ONLY AS OBSERVATION`.

### 5.5 Office artifact verification — artifact evidence only

`office-artifact-cache.js` validates:

- server verification passed;
- binary exists;
- MIME/extension match;
- preview/spec fingerprint matches when required.

That establishes that a generated Office artifact is internally coherent and tied to the expected preview specification. It does not prove that the overall user mission is satisfied.

**QIR disposition:** `OFFICE VERIFIER ADAPTER`.

### 5.6 Tool/provider `status: success` — operation evidence only

A Travel tool returning `status: 'success', executed: true` means the provider-backed operation executed and returned data. It cannot mean the user's trip-planning goal is complete.

**QIR disposition:** `TOOL OBSERVATION / EVIDENCE`.

### 5.7 Project `status` / Outcome State `goal.status`

Project and Outcome State persist semantic state, including goal/project status. These are valuable semantic records, but they are not currently a durable execution journal containing attempts, pending actions, checkpoints, failure diagnosis and budgets.

Under QIR, semantic goal/project status and Agent Run execution status must be related but separate concepts.

---

## 6. Artifact mutation authority — confirmed write paths

### 6.1 Valuable choke point exists

`AiStudio.commitDeskVfs(...)` is the strongest current Coding Desk write choke point. It:

- compares current and proposed VFS;
- blocks a broken/truncated regression over a working Preview;
- updates review state;
- records an in-memory checkpoint;
- installs the accepted VFS.

This should become the basis of a QIR **candidate -> verify -> promote** protocol rather than being deleted.

### 6.2 Not every current write is yet a universal candidate promotion

`openCanvasWithCode(...)` and related build application paths still assemble/prove/apply within browser component state. Preview healing can generate repaired output and route it through `writeHealedPreviewToVfs(...)` / `handleHealedPreview(...)`. Rewind intentionally bypasses the model-regression guard because it is an explicit user restore.

These are reasonable local semantics, but they are not yet one durable artifact-generation identity with:

- immutable generation id;
- parent checkpoint id;
- producer/attempt id;
- verification evidence;
- promotion/rejection record;
- durable rollback chain.

**QIR disposition:** `MOVE PROMOTION AUTHORITY TO ARTIFACT/CHECKPOINT PROTOCOL`; keep deterministic guards as validators.

---

## 7. Persistence consequence of the tool/failure audit

A different worker cannot currently reconstruct a Travel or Coding execution from durable state alone because the following remain request/browser local or fragmented:

- which tool/model step was executing;
- signed/model tool-turn continuation state;
- complete ordered attempt history;
- provider/tool failure diagnosis;
- whether retry/fallback budget has already been consumed;
- pending `PAUSE_AND_ASK` question as a run state;
- successful tool observations and their provenance as a universal event ledger;
- current candidate artifact generation and its parent verified checkpoint;
- Preview/compiler verification tied to that candidate generation.

This confirms the QIR runtime requirement: **semantic memory is not enough; execution state must be durable.**

---

## 8. Phase 0 authority decisions locked by this pass

| Current authority | Decision |
|---|---|
| `pcl-cognitive-kernel` | **KEEP/PROMOTE** as universal cognition/governance policy |
| `outcome-contract` / Proof of Done | **KEEP/PROMOTE** as sole mission completion authority |
| `agent-execution-fabric` types | **KEEP/EVOLVE** as plan/capability contracts |
| `AgentRuntimeRegistry` | **WIRE OR SUPERSEDE** behind durable runtime; do not create a second runtime beside it |
| `provider-resilience` | **KEEP** as low-level provider primitive |
| Travel `agent-tools` provider adapters | **KEEP AS TOOL ADAPTERS** |
| Travel/chat request-local agent loop | **MOVE ORCHESTRATION TO QIR** |
| browser turn-recovery orchestrator | **DELETE AFTER QIR CUTOVER**; keep useful diagnosis rules as runtime policy inputs |
| `proof-control-plane` | **ADAPTER** into software verifier/outcome evidence |
| build-job file-proof semantics | **KEEP** as step evidence primitive |
| Preview status/healing | **DERIVE/ADAPTER** as runtime evidence; no mission completion authority |
| Office artifact envelope verifier | **KEEP AS VERIFIER ADAPTER** |
| Coding Desk commit/checkpoint guard | **KEEP/EVOLVE** into durable candidate/promotion protocol |

---

## 9. Remaining work before Phase 0 exit

This pass does **not** close Phase 0. Remaining factual work:

1. finish exhaustive completion-claim search across UI/server copy and classify every `ready / done / complete / proved / verified / clean / success` occurrence with architectural significance;
2. finish all Outcome/Project/session write paths and retention/ownership rules;
3. map model-quality/usage telemetry into a normalized Step record;
4. inspect all non-Travel tool/API surfaces (Office, Research verifier, GitHub import/publish/deploy, Study symbolic/advisor tools, Finance/market tools) and separate pure tools from side effects;
5. map release/golden transactions to QIR outcome-level exit conditions;
6. produce final KEEP / MOVE / WRAP / DERIVE / DELETE table for every hot-path authority;
7. answer all twelve Phase 0 exit questions without inference.

No Phase 1 runtime behavior work should begin until those are complete.
