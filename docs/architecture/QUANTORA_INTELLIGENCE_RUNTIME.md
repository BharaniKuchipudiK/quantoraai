# Quantora Intelligence Runtime (QIR)

> **North Star:** turn an idea into a verified outcome.
>
> Quantora accepts a user's goal, determines the next useful action, executes that action with the appropriate model or tool, observes the real result, verifies progress against an explicit outcome contract, and continues until the goal is achieved, user input is genuinely required, or a bounded and explainable terminal condition is reached.

This document is the canonical architecture for Quantora's execution spine. Product features, Studios, model integrations, tools, and future runtimes must align to it. Domain-specific flows may extend the runtime, but they must not invent independent orchestration, retry, completion, or persistence semantics.

---

## 1. Seven immutable laws

1. **The user's goal is the unit of work; a model response is not.**
2. **An Agent Run survives HTTP requests, browser sessions, worker restarts, and provider failures.**
3. **Models reason; tools act; observations establish reality.**
4. **Every consequential action produces structured evidence.**
5. **Only an independent Outcome Verifier may declare an outcome complete.**
6. **Failure triggers diagnosis and a materially different next action, never a blind repeat.**
7. **Every run leaves enough durable state for another model, worker, or human to continue it.**

These laws are architecture-review gates. A change that violates one of them must not merge without an explicit architectural decision changing this document first.

---

## 2. The universal agent loop

Every Quantora task, from a simple answer to a multi-hour software or engineering project, uses the same control loop:

```text
USER GOAL
   |
   v
UNDERSTAND
   |
   v
PLAN / CHOOSE NEXT ACTION
   |
   v
ACT ---------------> MODEL or TOOL
   |                     |
   |                     v
   +---------------- OBSERVATION
                         |
                         v
                      VERIFY
                    /        \
                 FAIL        PASS
                  |            |
               DIAGNOSE     GOAL MET?
                  |         /       \
               REPLAN      YES       NO
                  |         |         |
                  +---------+         |
                            v         |
                         COMPLETE <---+
```

The loop is domain-independent. Websites, applications, AI agents, research, study, finance, travel, documents, 3D creation, CAD, robotics, and simulation differ by tools and outcome contracts, not by orchestration semantics.

---

## 3. QIR system architecture

```text
                         USER / CLIENT
                              |
                              v
                     QUANTORA EXPERIENCE
                 Chat | Voice | Files | 3D | Preview
                              |
                              v
                   +-----------------------+
                   |   COGNITION KERNEL    |
                   | goal | plan | state   |
                   | next action | policy  |
                   +-----------+-----------+
                               |
                               v
                   +-----------------------+
                   | DURABLE AGENT RUNTIME |
                   | runs | checkpoints    |
                   | resume | wait | retry |
                   +-----------+-----------+
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
   +-------------+      +-------------+      +-------------+
   | MODEL FABRIC|      | TOOL FABRIC |      | MEMORY /    |
   | Claude      |      | browser     |      | ARTIFACT    |
   | Gemini      |      | code        |      | GRAPH       |
   | OpenAI      |      | search      |      | run memory  |
   | Qwen/Kimi   |      | APIs        |      | project     |
   | open models |      | 3D/CAD/GPU  |      | provenance  |
   +------+------+      +------+------+      +------+------+ 
          |                    |                    |
          +--------------------+--------------------+
                               |
                               v
                   +-----------------------+
                   | EXECUTION FABRIC      |
                   | sandbox | containers  |
                   | browser | CPU | GPU   |
                   | render | simulation   |
                   +-----------+-----------+
                               |
                               v
                   +-----------------------+
                   | OUTCOME / VERIFICATION|
                   | tests | runtime       |
                   | evidence | simulation |
                   | quality | safety      |
                   +-----------+-----------+
                               |
                               v
                   +-----------------------+
                   | RESOURCE GOVERNOR     |
                   | context | quota       |
                   | cost | effort         |
                   | recovery reserve      |
                   +-----------------------+
```

---

## 4. Canonical Agent Run

A user request creates or resumes a durable **Agent Run**. The run, not an HTTP request, is the lifetime boundary.

Minimum durable state:

```ts
interface AgentRun {
  runId: string;
  goal: Goal;
  status: RunStatus;
  plan: Plan;
  context: ContextState;
  steps: AgentStep[];
  artifacts: ArtifactRef[];
  observations: Observation[];
  verification: VerificationResult[];
  checkpoints: Checkpoint[];
  budget: ResourceBudget;
  createdAt: string;
  updatedAt: string;
}
```

A browser refresh, provider timeout, quota pause, or worker restart must not delete or reset this state.

### Canonical run states

```text
QUEUED
UNDERSTANDING
PLANNING
EXECUTING
WAITING_ON_TOOL
OBSERVING
VERIFYING
REPAIRING
REPLANNING
CHECKPOINTED
WAITING_FOR_USER
WAITING_FOR_CAPACITY
PAUSED
COMPLETE
FAILED_TERMINAL
```

`FAILED_TERMINAL` is reserved for genuinely exhausted or non-recoverable conditions. Provider timeout, compile failure, model error, temporary quota exhaustion, browser disconnect, or worker restart are events inside a run, not automatically terminal states.

---

## 5. Cognition Kernel responsibilities

The Cognition Kernel owns only the universal decisions:

- What is the user's goal?
- What is already known and verified?
- What is the next useful action?
- Which capability is required?
- What evidence did the action produce?
- Has the outcome contract been satisfied?
- Should the run continue, replan, wait, ask the user, pause, or terminate?

It does **not** own provider-specific syntax, travel APIs, React details, Blender commands, or Studio-specific UI logic. Those belong behind adapters and tools.

No UI component, model adapter, compiler, provider, or artifact parser may independently declare the user's goal complete.

---

## 6. Durable Agent Runtime

Long-running work must be decoupled from Vercel request lifetime.

The web/API layer starts, observes, controls, and streams an Agent Run. A durable workflow runtime executes the run and persists its progress.

Target control surface:

```text
POST /runs               create run
GET  /runs/:id           read current durable state
POST /runs/:id/message   provide user input / clarification
POST /runs/:id/pause     pause safely
POST /runs/:id/resume    resume from checkpoint
POST /runs/:id/cancel    cancel intentionally
GET  /runs/:id/events    stream/replay run events
```

### Runtime selection

The first implementation should evaluate **Temporal with the TypeScript SDK** as the default durable workflow engine because Quantora needs checkpointed, restart-safe, long-running orchestration. The architecture must keep a workflow-engine adapter boundary so the rest of QIR is not coupled to one vendor.

Vercel remains appropriate for the interactive application surface and request/response APIs. Durable autonomous execution belongs in the execution plane.

---

## 7. Universal Tool Protocol

Capabilities are registered as typed tools. A Studio is primarily a curated tool/skill bundle, not a separate orchestration engine.

Each tool must declare:

```ts
interface ToolDefinition<I, O> {
  name: string;
  description: string;
  inputSchema: Schema<I>;
  permissions: PermissionPolicy;
  timeoutPolicy: TimeoutPolicy;
  execute(input: I, ctx: ToolContext): Promise<ToolResult<O>>;
}

interface ToolResult<T> {
  ok: boolean;
  output?: T;
  evidence: Evidence[];
  error?: StructuredError;
  telemetry: ToolTelemetry;
}
```

Initial capability families:

```text
web.search / web.fetch
browser.open / browser.inspect / browser.interact
files.read / files.write / files.patch
code.read / code.write / code.run / code.test / code.compile
artifact.create / artifact.read / artifact.publish
research.verify_claims
travel.search_flights / travel.search_hotels / travel.search_places
finance.calculate
document.create / slides.create / spreadsheet.create
image.generate / image.inspect
3d.create_scene / 3d.modify / 3d.render / 3d.export
cad.create_part / cad.assemble / cad.measure
simulation.physics / simulation.structural / simulation.flight
robotics.create_model / robotics.simulate / robotics.run
```

Adding a capability must not require adding another independent agent loop.

---

## 8. Model Fabric

Models are replaceable reasoning engines behind a common adapter contract.

```ts
interface ModelAdapter {
  infer(request: ModelRequest): Promise<ModelResult>;
  stream?(request: ModelRequest): AsyncIterable<ModelEvent>;
  capabilities(): ModelCapabilities;
  limits(): ModelLimits;
  pricing(): PricingModel;
  health(): Promise<ModelHealth>;
}
```

Adapters may exist for Anthropic, OpenAI, Gemini, OpenRouter, Ollama/open models, Qwen/Kimi, and future providers.

The Model Router selects a model using evidence, including:

- required capability;
- task type and complexity;
- context size;
- measured task success rate;
- latency;
- cost;
- health / circuit state;
- user policy and available quota.

A model ladder is not the orchestrator. It is a resource controlled by QIR.

---

## 9. Resource & Budget Governor

QIR separates five resource concepts:

1. **Plan allowance** — rolling user entitlement across the product.
2. **Run budget** — total autonomous inference/tool/compute allowance for a goal.
3. **Step budget** — bounded budget for one model or tool attempt.
4. **Recovery reserve** — protected capacity for diagnosis, failover, and self-correction.
5. **Premium escalation budget** — capacity reserved for expensive models/compute only when evidence warrants escalation.

A single model or provider may never consume the whole run budget while fallbacks receive no viable budget.

### Context is not the run

A model context window is working memory only. Agent Run state is durable external memory.

When working context grows, QIR compacts it into structured durable state:

```text
raw interaction history
      |
      v
verified facts + decisions + unresolved work + relevant artifacts
      |
      v
fresh bounded working context
```

A run may therefore accumulate far more information than any individual model context window.

### Usage-limit behavior

Reaching a rolling plan limit must checkpoint the run, not destroy it. The run may move to `WAITING_FOR_CAPACITY` and resume from the same checkpoint when capacity becomes available, or continue through permitted BYOK / upgraded capacity according to user policy.

---

## 10. Outcome Contracts and verification

The universal invariant is:

> **COMPLETE iff the latest relevant outcome state satisfies its explicit Outcome Contract using independent evidence.**

Examples:

### Software

```text
artifact exists
imports/dependencies resolve
compile succeeds
tests pass where applicable
runtime starts
required behavior verified
security/safety gates pass
```

### Research

```text
sources retrieved
claims attributable
citations resolve
freshness requirement met
material contradictions surfaced
```

### Travel

```text
entities resolve to real providers
freshness requirements met
availability/pricing traceable where claimed
```

### 3D / engineering prototype

```text
artifact parses/opens
geometry is valid enough for requested use
requested dimensions/constraints verified
render/simulation completed where required
known limitations clearly recorded
```

### Plain conversational answer

```text
response contract satisfied
safety policy satisfied
user's requested question actually answered
```

The model that creates or repairs an artifact cannot be the sole adjudicator of its success.

---

## 11. Detect -> Diagnose -> Propose -> Apply Candidate -> Verify -> Promote

The existing Quantora healing doctrine becomes a runtime law.

For mutable artifacts, repairs use isolated candidate generations:

```text
verified artifact v3
      |
      +--> candidate v4
               |
               v
            verify
           /      \
        FAIL      PASS
         |          |
      reject      promote
```

A failed repair must never silently destroy the last verified checkpoint.

Retries must change according to diagnosis:

- provider/transport failure -> viable alternate route;
- behavioral/contract failure -> strengthened or corrected instructions;
- artifact failure -> candidate repair using real compiler/runtime/test evidence;
- budget pressure -> checkpoint/reduce scope/wait/escalate according to policy;
- missing user information -> `WAITING_FOR_USER`.

Blind repetition is prohibited.

---

## 12. Checkpoints, provenance, and Artifact Graph

Every meaningful milestone can create a checkpoint. A checkpoint records the durable run state plus references to the artifacts and evidence needed to continue.

Artifacts form a versioned dependency graph rather than disconnected outputs.

Example:

```text
Drone Goal
  |
  +-- Requirements
  +-- Research
  +-- CAD frame v3
  |      +-- depends on payload requirement
  +-- Motor selection
  |      +-- depends on weight + thrust calculation
  +-- Flight simulation
  |      +-- depends on CAD + motors + battery
  +-- BOM
  +-- Render
  +-- Design report
```

If an upstream fact changes, QIR can identify downstream artifacts that are stale and require re-verification.

---

## 13. Persistence and memory layers

QIR distinguishes:

- **Working context** — bounded context for the immediate model step.
- **Run memory** — attempts, observations, evidence, decisions, unresolved work.
- **Project memory** — durable project goals, artifacts, decisions, dependency graph.
- **User memory** — permitted user preferences and long-lived context.

Another compatible model or worker must be able to resume from run/project state without replaying the entire historical conversation.

---

## 14. Observability: one event ledger

Every run has a correlation ID and append-only structured event stream.

Examples:

```text
run.created
intent.resolved
plan.updated
model.attempt.started
model.attempt.failed
model.route.switched
tool.started
tool.completed
artifact.created
artifact.candidate.created
compile.failed
verification.started
verification.failed
checkpoint.created
run.waiting_for_capacity
run.resumed
run.completed
```

The product UI and operators must be able to reconstruct what actually happened without inferring it from chat copy.

No secrets, raw credentials, or unnecessary generated source are written to telemetry.

---

## 15. Evals and release gates

Reliability is measured at the **goal/outcome level**, not only by unit tests.

QIR needs a growing golden task corpus spanning:

- plain conversation;
- multi-step reasoning;
- coding / repository repair;
- website/app generation;
- research;
- Study;
- Finance;
- Travel;
- documents/slides/spreadsheets;
- image reasoning;
- provider outage/failover;
- quota pause/resume;
- browser disconnect/resume;
- tool failure;
- deliberately wrong first repair;
- long-running multi-checkpoint work;
- 3D / engineering prototype as capabilities arrive.

Track at minimum:

```text
goal success rate
false-completion rate
verification pass rate
recovery success rate
provider failover success rate
checkpoint/resume success rate
human-intervention rate
median steps / latency / cost
```

A release cannot claim an end-to-end capability when its golden transaction stops before the actual verified outcome.

---

## 16. Migration strategy: spine surgery, not rewrite

Preserve valuable existing capabilities and move them behind QIR contracts:

- current UI and Studios;
- model registry and provider integrations;
- routing evidence and circuit breakers;
- Supabase/auth/project data;
- `verify-build`;
- `repair`;
- refinement-loop memory/stopping rules;
- VFS/compiler/Preview;
- travel APIs;
- Study/Finance/Research capabilities;
- safety and security controls;
- useful existing tests.

Do not create another domain-specific orchestrator. Each migration should remove or neutralize one independent source of truth for run state, retry, artifact mutation, or completion.

---

## 17. Locked implementation roadmap

### Phase 0 — Execution Spine Truth Audit

Map every current decision point from user prompt to final outcome.

For each point record:

- owner of state;
- who can retry;
- who can mutate artifacts;
- who can select/change models;
- who can declare success;
- persistence boundary;
- timeout/budget policy;
- evidence produced;
- behavior after process/browser/provider failure.

Deliverable: one current-state sequence/state map and a deletion/consolidation list.

## Where the phases actually stand

Kept here rather than in a commit message because "is Phase 3 done?" was asked
three times in one day and answered from memory. A phase is closed only when
something a machine runs can tell you so — a claim with no gate behind it is the
thing this repository has an incident for.

| phase | state | what closes it | the gate that says so |
|---|---|---|---|
| 1 — Universal Agent Contracts | closed | `api/_lib/qir-contracts.ts` | `node --test api/_lib/qir-*.test.ts` |
| 2 — Durable Agent Runtime | closed | `api/_lib/qir-workflow-adapter.ts`, pause/resume/cancel, the event ledger | `qir-workflow-adapter.test.ts` — a conformance suite a second engine passes, plus the deployed durability gate |
| 3 — Context, Memory, Resource Governor | closed | bounded context, compaction, nested budgets, recovery reserve, capacity waiting, model AND tool accounting | `refinement-loop.test.js`, the QIR route tests, the tool-accounting seam tests |
| 4 — Universal Tool Fabric | closed | `api/_lib/tool-registry.ts` — one registration per tool, carrying identity, declaration, enablement, dispatch and time budget | `tool-registry.test.ts` |
| 5 — Outcome & Verification Engine | closing — the claim is bound, the act deliberately is not | `qir-contracts.ts` (a Run reaches COMPLETE only on verified Proof of Done + matching independent verification), `buildJobOutcome`/`deskFingerprint`, `completion-claim.ts` + `unproved-claim-note.js` | `completion-claim.test.ts` (precision 100%, recall floor), `qir-contracts.test.ts`, `unproved-claim-note.test.js` |
| 6 — Model Fabric v2 | closing — the ledger is measured AND read: every route plan takes the last thirty minutes of `model_quality_events` and moves a model that failed most of its recent turns (≥5 turns, ≥50% failures) down the free ladder; Auto starts on a route the ledger has not condemned, a model the person named stays first with its evidence on the route; the paid rung is never promoted and the platform spend ceiling (`OPENROUTER_SPEND_CEILING_USD`) bounds it. One `StreamFinish` and one ledger row shape serve both gateways. Still open: latency as a tie-breaker, and a per-tenant budget | `measured-outcome.ts` (summary, restraint, cached reader), `store.readModelQualityEvents`, `planInferenceRoutes` (`measuredOutcomes`, `autoRouting`), `paid-route-gate.ts` | `measured-outcome.test.ts`, `inference-control-plane.test.ts` (a failing fallback moves down and says why; a named model stays first; Auto yields; no evidence changes nothing), `model-quality-outcome.test.ts`, `paid-route-gate.test.ts` |
| 7 — Coding / Software Engineering Runtime | first cut — one model-owned plan per turn: `POST /api/plan-turn` reads the whole brief, what is attached and a bounded history, and names the lane (build, office, advisor, chat) before any keyword rule runs; the keyword rules are the fallback when the planner is slow or down, never the judge. Two invariants: a pinned desk is never moved, and a build the desk already owns is never vetoed. The plan rides on the user turn (`lanePlan`), so the desk reads the same decision the server did — a website brief that says "excel-like" builds a site instead of a workbook. Still open: the durable repository sandbox, shell, tests, checkpoints, candidate patches, rollback and deployment verification | `turn-planner.ts` (schema, deterministic plan, reconcile), `handlers/plan-turn.ts`, `semantic-router.ts` (shared with `classify-intent`), `shared/office-intent.js`, `src/lib/turn-plan-client.js` | `turn-planner.test.ts` (corpus, invariants), `turn-plan-client.test.js`, `office-intent.test.js` (a planned turn decides), `scripts/turn-planner-browser-gate.mjs` (the plan decides the lane, a dead planner changes nothing, a pin holds) |

**Where Phase 5 binds, and where it deliberately does not.** "Make Outcome
Contracts mandatory" has two readings and they are not the same product. Bound
here is the CLAIM: the desk may build whatever it likes, and may not tell the
user the work is finished unless a verifier says so. Not bound is the ACT: a
turn is never refused for lacking a stated Definition of Done.

That was a decision, taken 2026-09-05, and the reason is in this repository's
own incident list. Three separate outages in one night were the platform
refusing work the model had done correctly — an intake modal discarded over a
newline, an image url wrapped twice because the policy demanded the proxy, a
modal discarded over a markdown fence. Binding the act would add a fourth place
to reject a good turn. Binding the claim cannot refuse anything; it can only
decline to repeat a boast nothing checked.

**The detector is measured, because a binding is only as good as it.** The
claim check ran on every turn for weeks behind a prose regex that read 27% of
real completion claims and falsely corrected 43% of what it did flag — including
"I have finished reading the file you shared", which claims nothing about the
work. Precision is the harder floor and sits at 100%: a correction printed under
a reply that made no claim is the platform contradicting a correct model in
front of the user, and per §5 that is the gate the next person mutes.

**What Phase 4 deliberately left to Phase 5.** §7's `ToolResult` sketch carries
`evidence` and `telemetry`; the registry returns each family's raw result
instead. Normalising two result protocols into one `ok` is only honest once the
verifier evidence that would justify it exists, which is Phase 5's subject.
Doing it in Phase 4 would have been a rewrite wearing a migration's clothes, and
Phase 4's own criterion forbids changing user-visible behaviour.

**What the registry is not.** It is the fabric for tools the MODEL may call.
Research verify and deep dive are user-initiated desk actions routed by request
shape; making them model-callable is a product decision, not a migration, and
belongs with the same consent question that keeps GitHub writes out of the tool
list.

---

### Phase 1 — Universal Agent Contracts

Implement pure, versioned types/state transitions for:

`AgentRun`, `AgentStep`, `Goal`, `Observation`, `Evidence`, `Checkpoint`, `ToolCall`, `StructuredError`, `OutcomeContract`, `VerificationResult`, and `ResourceBudget`.

No Studio-specific logic.

### Phase 2 — Durable Agent Runtime

Implement workflow-engine adapter, durable run persistence, event ledger, pause/resume/cancel, checkpoint/recovery, and client observation APIs.

Prove a run survives worker termination and browser refresh.

### Phase 3 — Context, Memory, and Resource Governor

Implement bounded working context, compaction into durable state, nested budgets, recovery reserve, capacity waiting/resumption, and model/tool accounting.

### Phase 4 — Universal Tool Fabric

Create the typed tool registry and migrate existing capabilities behind it without changing their user-visible behavior.

### Phase 5 — Outcome & Verification Engine

Make Outcome Contracts mandatory. Remove independent READY/DONE/PROVED paths that bypass verifier evidence.

### Phase 6 — Model Fabric v2

Normalize provider adapters and route using capability + measured outcome + health + latency + cost + budget. Keep provider/model details below the kernel.

### Phase 7 — Coding / Software Engineering Runtime

Add durable repository sandbox, shell, tests, browser, checkpoints, candidate patches, rollback, deployment verification, and end-to-end coding evals.

**First cut (2026-09-06): the turn planner.** Before this phase the first decision of every turn — build, Office document, advisor desk, or chat — was made by regular expressions over the first few words, and a website brief that mentioned an "excel-like tracker" was sent to the workbook generator on the word alone. A coding agent does not work that way: the model reads the whole brief and decides. `POST /api/plan-turn` now does exactly that, through the same semantic router `classify-intent` uses, and answers with one plan per turn: the lane, the desk or Office kind, a confidence and a reason. `reconcileTurnPlan` keeps the plan honest against two invariants a model may not override — a pinned desk never moves, and a build the desk already owns is never vetoed — and the deterministic rules remain as the fallback, so a slow or dead planner changes nothing about how the turn ran yesterday. The plan travels on the user turn as `lanePlan`, which is how the desk (whose Office detection runs from the transcript) follows the same decision the request carried. Not in this cut: the durable sandbox and its shell, checkpoints and rollback, which are the rest of the phase.

### Phase 8 — Creative / 3D Runtime

Add image/3D scene tools, GPU render workers, artifact inspection, Blender/Three.js-style capability adapters, and 3D outcome contracts.

### Phase 9 — Engineering / Robotics / Simulation

Add CAD, physics/simulation, robotics/ROS-style tools and appropriate safety/engineering verification boundaries.

### Phase 10 — Artifact Graph and Dependency Revalidation

Versioned artifact graph, provenance, stale-dependency detection, selective re-execution, project continuation over days/months.

### Phase 11 — Adaptive Intelligence and Scale

Outcome-based routing learning, eval-driven optimization, tenant isolation, quotas/pricing, cost governance, performance, and operational hardening.

---

## 18. First proof of the spine

Do not use a website-only proof.

The first QIR end-to-end proof should require multiple capability types and at least one recovery/checkpoint boundary. Example:

> Research a practical educational quadcopter concept, calculate basic thrust needs from explicit assumptions, create a simple conceptual 3D artifact, render it, produce a BOM and short design rationale, deliberately survive one injected provider/tool failure, resume from durable state, and complete only after all required artifacts/evidence pass their Outcome Contracts.

The purpose is not aerospace fidelity in v1. The proof is:

```text
one goal
-> multiple actions
-> multiple tools
-> durable state
-> failure
-> diagnosis
-> recovery
-> checkpoint/resume
-> independent verification
-> verified outcome
```

---

## 19. Non-goals for QIR v1

To maintain focus:

- no multi-agent swarm until one-agent orchestration is demonstrably insufficient;
- no new model provider merely because it is fashionable;
- no website-specific orchestration patches;
- no replacement of working domain capabilities unless migration requires it;
- no autonomous action without a verifier, policy, or explicit escalation boundary;
- no claim of completion based solely on model prose.

---

## 20. Definition of success

QIR succeeds when a user can give Quantora a goal and the platform can continue making observable, checkpointed progress across models and tools until it can **prove the outcome**, wait safely for capacity/user input, or explain a genuinely terminal limitation without losing the work already completed.

The user should experience one product:

> **I told Quantora what I wanted. It kept working until it could prove the result.**
