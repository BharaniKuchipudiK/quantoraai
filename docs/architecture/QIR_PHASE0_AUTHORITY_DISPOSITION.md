# QIR Phase 0 — Authority Disposition Table

Status: **IN PROGRESS**  
Audit target: production execution spine on `main` at `c6dd9e93276a3ab9f2c6c76c9c5435211cc162bf`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

This table converts the Phase 0 findings into the explicit migration decision requested by the audit contract: **KEEP, MOVE, WRAP, DERIVE, or DELETE AFTER MIGRATION**.

The purpose is not to rename files. It is to decide who owns each architectural fact after QIR exists, while preserving working domain capability.

---

## 1. Disposition vocabulary

- **KEEP** — capability remains authoritative for its local domain fact.
- **MOVE** — ownership of the architectural fact moves into QIR; existing code becomes an input/helper or is retired.
- **WRAP** — preserve implementation, but invoke it through a QIR model/tool/verifier/side-effect contract.
- **DERIVE** — component/UI may display the fact but may not independently decide it.
- **DELETE AFTER MIGRATION** — duplicate orchestration/authority is removed only after the QIR replacement is proven.

---

## 2. Sovereign execution facts

| Architectural fact | Current authority | Disposition | Final authority |
|---|---|---|---|
| active user goal | Outcome State, Project goal, conversation snapshot, build/session heuristics | **MOVE** | QIR Agent Run + Project Memory reference |
| Definition of Done | Outcome Contract / Outcome State + task/domain inference | **MOVE/PROMOTE** | QIR Outcome Contract |
| active Run identity | no durable universal record | **NEW/MOVE** | Durable Agent Runtime |
| Run status | browser turn state, build job, Preview, domain loops, conversation state | **MOVE; all others DERIVE** | Durable Agent Runtime |
| current plan | request-local agent/build/domain plans | **MOVE** | QIR Plan snapshot |
| next executable step | conversation engine, domain gateway ordering, build job, agent loops | **MOVE** | Cognition Kernel + Durable Runtime |
| Run completion | Proof of Done concept exists but local `success/ready/clean/completed` states remain distributed | **MOVE/PROMOTE; all local states DERIVE** | QIR Outcome Engine only |
| cancellation/pause/waiting | browser Stop + local errors/timeouts | **MOVE** | Durable Runtime state machine |

---

## 3. Cognition and planning

| Current module/pattern | Disposition | Reason |
|---|---|---|
| `pcl-cognitive-kernel.ts` | **KEEP/PROMOTE** | already models autonomy, risk, human gates, evidence coverage and verify-before-done |
| `outcome-contract.ts` / Proof of Done | **KEEP/PROMOTE** | strongest provider-neutral mission completion contract |
| `conversation-engine.ts` next-move logic | **KEEP AS SIGNAL / WRAP** | useful conversational judgment, but must not execute a durable plan itself |
| `agent-execution-fabric.ts` task/capability types | **KEEP/EVOLVE** | useful seed for QIR plan and adapter contracts |
| unwired `AgentRuntimeRegistry` | **WRAP OR REPLACE** | registry concept useful; process-local unwired authority is insufficient |
| build/session/intent classifiers | **KEEP AS START/ROUTING SIGNALS** | useful at Run creation or explicit goal switch |
| repeated build continuity derivation | **DELETE AFTER MIGRATION** | once a Run exists, continuation is durable state rather than heuristics |
| Finance fixed pre-chat gateway ordering | **DELETE AS ORCHESTRATOR; KEEP TOOLS** | deterministic engines are valuable, fixed chain is duplicate next-action authority |
| Travel request-local tool/model loop | **DELETE AS RUN OWNER; KEEP ADAPTERS** | loop moves into QIR execution/recovery |

---

## 4. Model Fabric

| Current module/pattern | Disposition | Final role |
|---|---|---|
| model registry/catalog | **KEEP** | Model Fabric inventory |
| model capability/eligibility logic | **KEEP/WRAP** | route eligibility |
| `selectModelsForTurn` / route scoring | **KEEP/EVOLVE** | candidate route planner |
| measured `model_quality_events` routing signal | **KEEP** | Attempt/Step quality evidence |
| provider circuit store | **KEEP** | shared provider-health input |
| quota-domain/failure-domain handling | **KEEP/WRAP** | normalized Model Fabric failure/evidence |
| backend provider loop | **WRAP; MOVE recovery decision** | execute one planned Step/Attempt sequence under QIR |
| client model-switch retry | **DELETE AFTER MIGRATION** | QIR Recovery owns route switching |
| request-level model `success` | **DERIVE AS ATTEMPT EVIDENCE** | never Run completion |

---

## 5. Tool / Execution Fabric

| Capability | Disposition | QIR role |
|---|---|---|
| Travel live flight/place/route reads | **KEEP/WRAP** | read-only Tool adapters |
| disabled Travel booking/payment actions | **KEEP DISABLED** until transaction protocol exists | future transactional Tools |
| Finance calculators/data gateways | **KEEP/WRAP** | deterministic read/compute Tools |
| Finance profile writes | **KEEP/WRAP** | internal owner-scoped state Tool |
| Office generation/compiler | **KEEP/WRAP** | artifact Tool + format-specific verifier |
| Research source fetch/proposer | **KEEP/WRAP** | research Tool/proposer |
| Study assessment/verification runtime | **KEEP/WRAP** | Study verifier/evidence Tools |
| Vercel publish | **KEEP/WRAP** | external side-effect Tool |
| custom-domain connect | **KEEP/WRAP** | external hard-to-reverse Tool |
| GCP deployment | **KEEP/WRAP** | external hard-to-reverse Tool |
| GitHub Create PR | **WRAP + SECURITY FIX #452** | external partial/reversible Tool |
| GitHub Merge PR | **WRAP + SECURITY FIX #452** | hard-to-reverse Tool requiring principal + exact approval |
| account deletion | **KEEP DEDICATED / WRAP ONLY WITH STRONG POLICY** | destructive owner action; never autonomous default |

---

## 6. Side-effect authorization

| Current control | Disposition | QIR role |
|---|---|---|
| `guardPclSideEffect` | **KEEP/PROMOTE** | universal exact-action authorization seam |
| `pclHumanConfirmation` | **KEEP/EVOLVE** | first-party approval evidence |
| `recordPclExecutionEvidence` | **KEEP/EVOLVE** | semantic/governance evidence projection |
| resource ownership checks (`published_sites`, owner-scoped state) | **KEEP** | principal/resource authorization input |
| `GITHUB_ALLOWED_REPOS` | **KEEP AS RESOURCE BOUNDARY ONLY** | never treated as subject authorization |
| shared GitHub token delegated to any active session | **DELETE/FIX IMMEDIATELY (#452)** | replace with admin/explicit principal now; user-bound GitHub auth later |

Universal rule:

> PCL approval proves **intent**. Resource authorization proves **permission**. A provider credential proves **technical capability**. QIR must require the right combination; none substitutes for another.

---

## 7. Recovery and stopping

| Current loop | Disposition | Final authority |
|---|---|---|
| backend provider failover | **KEEP low-level mechanics; MOVE global decision** | QIR Recovery |
| client `turn-recovery` | **DELETE AFTER MIGRATION** | QIR Recovery |
| coding/refinement loop | **KEEP scoring/stopping primitives; MOVE orchestration** | QIR candidate-artifact recovery |
| Preview repair/healing | **KEEP adapter mechanics; MOVE retry policy** | QIR Recovery |
| Office request-local provider attempts | **KEEP initially; progressively MOVE run-level recovery** | QIR Recovery + Office adapter safety bounds |
| domain-specific retry copy | **DERIVE** from normalized Failure + Recovery decision | QIR Failure model |

The durable Run must record attempts across all these layers so one recovery policy can see the whole history.

---

## 8. Failure authority

| Current behavior | Disposition |
|---|---|
| raw provider/tool/runtime errors | **WRAP** into normalized QIR Failure classes |
| provider-specific reason strings | **KEEP as diagnostic detail**, not control-plane enum |
| client-only timeout ownership | **MOVE** to Step/Attempt deadlines + UI derived wait state |
| Preview compile/runtime failure codes | **KEEP/WRAP** as verification/runtime Failure evidence |
| deterministic `insufficient`/refusal paths | **KEEP**; never auto-promote to success |
| transaction-disabled Travel failures | **KEEP FAIL-CLOSED** |

---

## 9. Memory, context and persistence

| State | Disposition | Final role |
|---|---|---|
| browser Studio sessions/localStorage | **KEEP** | UX/cache; not execution authority |
| desk local/in-memory checkpoints | **KEEP CACHE; MOVE identity/history** | durable Artifact Graph/Run checkpoints |
| Project Store | **KEEP** | Project Memory |
| Outcome State / Cognitive Ledger | **KEEP** | consented semantic/governance memory |
| User Context Graph | **KEEP** | account/connected-source context |
| Study mastery/evidence | **KEEP** | Study domain evidence |
| provider circuits | **KEEP** | infrastructure health state |
| usage/model-quality/product telemetry | **KEEP/EVOLVE** | analytics + Attempt evidence, not Run journal |
| Agent Run journal | **NEW** | authoritative operational persistence |

A durable Run must not be hidden inside optional semantic memory and must not depend on browser localStorage.

---

## 10. Context management

| Current authority | Disposition |
|---|---|
| browser transcript/history compaction | **KEEP for UX/provider payload efficiency** |
| project context pack | **KEEP as semantic input** |
| Outcome/PCL state | **KEEP as governed semantic input** |
| user-context graph | **KEEP as account input** |
| domain-specific prompt context builders | **KEEP/WRAP** as context adapters |
| deciding the canonical working context for a Run | **MOVE** to QIR Context Manager |
| replaying entire conversation to resume work | **DELETE AS REQUIREMENT** |

QIR continuation should hydrate from Run state + selected memory/evidence/artifact refs, not reconstruct the execution machine from prose history.

---

## 11. Resource and Budget Governor

| Current budget | Disposition |
|---|---|
| server whole-chat wall-clock budget | **KEEP as request safety bound; not Run budget** |
| client chat deadline | **KEEP as UI/network safety bound; not Run budget** |
| provider attempt timeout | **KEEP adapter safety bound** |
| provider circuit/quota skip | **KEEP health/capacity input** |
| coding attempt/refinement caps | **KEEP as policy inputs** |
| Preview compile/render timers | **KEEP verifier safety bounds** |
| paid-route spend gate | **KEEP/WRAP** |
| run budget/recovery reserve/premium escalation budget | **NEW/MOVE** to QIR Resource Governor |

Local timers remain necessary. They stop individual operations; they must not define the lifetime of the mission.

---

## 12. Artifact and checkpoint authority

| Current component | Disposition |
|---|---|
| VFS/parser | **KEEP** |
| coding deterministic repair helpers | **KEEP/WRAP** as candidate operations |
| Preview compiler/runtime | **KEEP/WRAP** as execution/verifier adapters |
| Office deterministic compiler | **KEEP** |
| Office fingerprint/verification | **KEEP** |
| local desk snapshots/rewind | **KEEP cache; MOVE durable checkpoint authority** |
| current accepted VFS mutation in browser | **DERIVE from promoted generation** after migration |
| artifact generation id / candidate / promotion chain | **NEW/MOVE** to Artifact Graph + Run journal |
| rollback target | **MOVE** to last verified durable checkpoint |

Required universal protocol:

```text
verified generation N
-> candidate N+1
-> execute/compile/verify
-> promote N+1 OR reject and retain N
-> persist checkpoint/evidence
```

---

## 13. Verification authority

| Existing verifier/evidence source | Disposition |
|---|---|
| Coding proof control plane | **KEEP/WRAP** |
| Preview compile/runtime readiness | **KEEP/WRAP** |
| build quality verifier | **KEEP/WRAP** |
| Office verifier | **KEEP/WRAP** |
| Research deterministic source verification | **KEEP/WRAP** |
| Study verification runtime/governance | **KEEP/WRAP** |
| Finance freshness/source checks | **KEEP/WRAP** |
| provider side-effect confirmation | **KEEP as Observation** |
| mission completion | **MOVE/PROMOTE** to QIR Outcome Engine only |

A domain verifier owns its own truth class. It does not own the user's entire mission.

---

## 14. UI and completion copy

The following states remain useful but become **DERIVED ONLY**:

- generating;
- running;
- compiling;
- ready;
- clean;
- degraded;
- failed;
- verified;
- completed;
- published;
- tool completed.

Each UI surface must know which level it represents.

Only a verified QIR Outcome Contract may justify mission-level copy such as:

- “Done”;
- “Your request is complete”;
- “The goal has been achieved.”

Local states may use precise phrases such as “Preview is running”, “PR created”, “artifact verified”, or “deployment created”.

---

## 15. Release governance

| Current gate | Disposition |
|---|---|
| typecheck/lint/import/wiring/audit gates | **KEEP** |
| browser release gates | **KEEP** |
| Vercel deployment status | **KEEP** |
| deployed readiness | **KEEP** |
| deployed shop action | **KEEP BLOCKING** |
| deployed calculator/website golden transaction | **KEEP; MAKE BLOCKING only after deterministic/stable qualification** |
| capability-claims gate | **KEEP** |
| dead-control gate | **KEEP** |

Release evidence should mirror runtime evidence levels and must not use infrastructure readiness as a substitute for verified user outcomes.

---

## 16. Deletion list after QIR equivalence is proven

Do **not** delete these today. They are the duplicate authority that should disappear only after a was-red QIR path proves replacement behavior:

1. client-owned whole-turn model-switch recovery;
2. browser-derived durable build-continuation authority;
3. domain gateway ordering as sovereign next-action logic;
4. Travel request-local loop as Run lifetime owner;
5. local artifact success states being used as mission-completion proxies;
6. duplicated run/retry/budget state distributed across components;
7. any direct external write path that bypasses universal subject authorization + PCL side-effect policy;
8. requirement to replay full conversation history to reconstruct active execution state.

---

## 17. Phase 1 boundary implied by this table

Phase 1 must **not** begin by rewriting domains.

The smallest safe vertical slice is:

1. durable Run identity + state/event journal;
2. one plan/step contract;
3. one Model Attempt adapter behind existing routing;
4. one Tool/Verifier observation contract;
5. one normalized Failure + Recovery decision;
6. one Outcome Engine transition;
7. browser UI derived from Run events;
8. current capabilities wrapped, not replaced.

Coding is the best first proving ground because it exercises models, artifacts, compiler/runtime verification, repair, checkpoints, Preview and user-visible completion in one domain.
