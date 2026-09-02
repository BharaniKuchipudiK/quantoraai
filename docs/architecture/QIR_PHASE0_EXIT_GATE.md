# QIR Phase 0 — Exit-Gate Answers

Status: **AUDIT ANSWERS COMPLETE; PHASE 1 NOT YET AUTHORIZED**  
Audit target: production execution spine on `main` at `c6dd9e93276a3ab9f2c6c76c9c5435211cc162bf`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`  
Security blocker discovered during audit: **#452**

This file answers the twelve mandatory Phase 0 exit questions with factual current-state answers and the locked QIR destination.

An answer may legitimately be “there is no single authority today.” Phase 0 is a truth audit, not a requirement that the current system already have the target architecture.

The audit branch was refreshed onto current `main`. The subsequent H2 Study assessment-corpus change extends Study's governed assessment content/governance surface; it does not introduce a new universal Run owner, model router, retry owner, budget governor or mission-completion authority, so the execution-spine conclusions below remain unchanged.

---

## 1. Where is the user's goal stored?

### Current fact

There is **no single Run-owned goal record**.

Goal/mission information is currently represented through several layers:

- Project State (`goal`, project metadata/context);
- Outcome State / PCL semantic state when available and consented;
- conversation-engine snapshots and request context;
- browser session/conversation context;
- build/session continuation heuristics for Coding;
- domain-specific request state.

Project/Outcome State can preserve valuable semantic continuity, but neither is the operational Agent Run journal.

### QIR destination

**Agent Run owns the active execution goal and references Project/Outcome/User Memory as context.**

**Exit answer: FACTUALLY KNOWN.**

---

## 2. Where is the current run state stored?

### Current fact

A universal durable Run state is **missing**.

Current execution state is distributed across:

- request-local backend variables/provider loop;
- browser `useChatStream` turn state;
- Coding build-job state;
- Preview component state;
- refinement/healing refs;
- domain-specific mini-runtimes;
- semantic Project/Outcome stores that do not contain the complete execution machine.

No durable record currently owns plan cursor, complete attempt history, current step, normalized failure, pending gate, artifact generation/checkpoint and remaining run/recovery budget together.

### QIR destination

**Durable Agent Runtime + append-only/replayable Run event journal.**

**Exit answer: FACTUALLY KNOWN — current authority is absent.**

---

## 3. Who decides the next action?

### Current fact

There are **multiple next-action authorities**:

- conversation-engine decision logic;
- client Coding/build continuation logic;
- Finance pre-chat gateway ordering;
- Travel's request-local agent/tool loop;
- Coding build job/refinement/Preview healing;
- domain-specific verifier/recovery paths.

PCL cognition already evaluates policy/autonomy/evidence but is not the sole executable planner.

### QIR destination

**Cognition Kernel proposes/updates the plan; Durable Runtime owns the executable cursor and step transition.** Domain logic returns signals, observations or verifier results.

**Exit answer: FACTUALLY KNOWN — duplicate authority confirmed.**

---

## 4. Who chooses and changes models?

### Current fact

Backend model selection and route planning are primarily owned by the model registry/routing/inference control-plane path, with provider health/circuits and measured quality influencing the choice.

However, model/fallback changes are not owned by one durable recovery policy:

- backend provider loop can fail over;
- client turn recovery can retry/switch again;
- Office and other local runtimes can own provider attempts separately.

### QIR destination

**Model Fabric** owns eligible routes and executes planned attempts; **QIR Recovery** decides whether/when a new route is attempted.

**Exit answer: FACTUALLY KNOWN.**

---

## 5. Who invokes tools?

### Current fact

Tool invocation is distributed:

- Travel tools inside the chat agent loop;
- deterministic Finance gateways before chat;
- Office's dedicated generation endpoint;
- Research verification task routed through chat;
- Study verification/assessment runtime;
- direct external endpoints for Vercel/domain/GCP/GitHub;
- internal project/outcome/notebook/profile/account state endpoints.

There is no universal typed Tool Executor that owns invocation lifecycle across domains.

### QIR destination

**Tool / Execution Fabric** with typed invocation, subject/resource authorization, side-effect policy, idempotency, deadline, observation/evidence and normalized failure.

**Exit answer: FACTUALLY KNOWN.**

---

## 6. Who owns retries and stopping?

### Current fact

Retry/stopping is fragmented across at least:

- backend provider/failover loop;
- client turn recovery;
- Coding/refinement loop;
- Preview repair/healing;
- Office provider-attempt budget;
- provider circuits and per-operation timeouts.

Each local loop is useful, but there is no durable global record of all attempts or one recovery reserve.

### QIR destination

**One QIR Recovery state machine** owns retry/switch/repair/rollback/wait/ask/terminal decisions. Adapters keep only low-level safety timeouts and single-operation mechanics.

**Exit answer: FACTUALLY KNOWN — duplicate authority confirmed.**

---

## 7. Where is context compacted and persisted?

### Current fact

Context currently lives at several scopes:

- browser chat/session localStorage with compaction/eviction safeguards;
- Project Store and Project Context Pack;
- Outcome State / Cognitive Ledger;
- User Context Graph;
- Study domain evidence/mastery;
- request/domain-specific prompt builders.

These stores have different retention and consent semantics. That separation is valuable.

What is missing is one Run Context Manager that selects the canonical working set and allows another worker to continue without reconstructing control state from the transcript.

### QIR destination

**Context Manager** composes bounded working context from Run state + selected Project/Outcome/User/domain evidence/artifact refs while preserving each store's retention policy.

**Exit answer: FACTUALLY KNOWN.**

---

## 8. Who owns budgets and recovery reserve?

### Current fact

There is **no universal Resource Governor**.

Budget-like limits are distributed:

- server chat wall-clock budget;
- client request deadline;
- provider attempt timeout/allocation;
- provider circuit/quota controls;
- Coding attempt/refinement caps;
- Preview compile/render deadlines;
- spend/paid-route controls;
- domain endpoint limits.

These are safety limits, not one durable Run budget.

### QIR destination

**Resource & Budget Governor** owns plan allowance, Run budget, Step budget, recovery reserve and premium escalation capacity. Existing local limits remain adapter/safety inputs.

**Exit answer: FACTUALLY KNOWN — current authority is absent.**

---

## 9. Who owns artifact versions/checkpoints?

### Current fact

Artifact safety exists but is not universal/durable:

- Coding VFS/parser and deterministic repair helpers;
- browser desk snapshots and rewind;
- Preview compile/runtime evidence;
- Office spec/binary fingerprint verification;
- current accepted VFS state in browser components.

There is no durable universal chain of:

`verified generation -> candidate -> verifier -> promote/reject -> checkpoint`.

Desk checkpoint history is principally browser/in-memory lifetime.

### QIR destination

**Memory & Artifact Graph + Run journal** own immutable generation ids, candidates, verification evidence, promotion and last verified checkpoint. Browser snapshots become cache.

**Exit answer: FACTUALLY KNOWN — durable authority is missing.**

---

## 10. Who alone may declare the outcome complete?

### Current fact

No single executable authority has sole control today.

The repository contains several legitimate lower-level success states:

- model attempt `success`;
- tool `completed`;
- Preview `ready/clean`;
- Coding proof `pass`;
- Office verification pass;
- Research supported claim;
- Study `canClaimVerified`;
- project lifecycle `completed`;
- deployment/product events.

`outcome-contract.ts::evaluateProofOfDone(...)` is the strongest existing mission-level seed and conversation verification already tries to reject unsupported Done claims, but it is not yet the sovereign durable Run transition.

### QIR destination

**Outcome Engine alone may emit `run.completed` after the mission Outcome Contract is independently verified.** Everything else is evidence at a lower level.

**Exit answer: FACTUALLY KNOWN.**

---

## 11. Can another worker resume after a crash without replaying the whole conversation?

### Current fact

**No.**

Some semantic/project state survives, and the browser preserves substantial session/desk context, but another compatible server worker cannot reconstruct the complete active execution machine from one durable Run journal because that journal does not exist.

Missing resumable facts include:

- plan + cursor;
- Step/Attempt ids;
- normalized failure/recovery state;
- pending human/user gate;
- artifact generation/checkpoint;
- tool continuation/idempotency state;
- remaining Run/recovery budget;
- event cursor.

### QIR destination

A compatible worker loads the Run snapshot/event stream and resumes from the last safe persisted transition without transcript replay as control logic.

**Exit answer: FACTUALLY KNOWN — current capability is NO.**

---

## 12. Which existing modules will be migrated, wrapped, derived, or deleted?

### Current fact

The repository-wide disposition is now explicitly recorded in `QIR_PHASE0_AUTHORITY_DISPOSITION.md`.

Summary:

- **KEEP/PROMOTE:** PCL cognition, Outcome Contract, model registry/quality/circuits, domain verifiers, VFS/compiler, Research/Study/Finance/Travel/Office domain primitives, PCL side-effect guard, Project/Outcome/User Context stores, release gates.
- **MOVE:** Run identity/state, plan cursor, global retry/recovery, canonical context selection, Run budgets/reserve, artifact generation/checkpoint authority, mission completion.
- **WRAP:** model execution, domain tools, Office, Travel, Finance, Study/Research verifiers, Preview/compiler, Vercel/domain/GCP/GitHub side effects.
- **DERIVE ONLY:** browser/UI run status and mission-level completion copy.
- **DELETE AFTER MIGRATION:** duplicate client/server recovery authority, heuristic build continuation as Run authority, domain mini-orchestrator ordering, local mission-completion proxies, transcript replay as required execution-state reconstruction.
- **SECURITY FIX BEFORE BROADENING:** GitHub shared-token create/merge subject authorization (#452).

**Exit answer: FACTUALLY KNOWN.**

---

# Phase 0 verdict

The twelve questions now have factual answers.

That means the **truth-audit portion of Phase 0 is complete enough to define the migration boundary**.

It does **not** mean Phase 1 should start immediately or that PR #446 should be merged without review.

Three gates remain before Phase 1 runtime implementation is authorized:

1. **Security blocker #452 must be contained or explicitly closed by an approved fix.** QIR must not build a universal side-effect executor on top of a known shared-credential subject-authorization gap.
2. **PR #446 architecture review must confirm one North Star.** No competing runtime doctrine may claim ownership of Run state/completion/recovery in parallel.
3. **Phase 1 must begin with a was-red vertical-slice contract**, not a broad rewrite. The first slice must prove durable Run persistence/resume + one model/tool/verifier loop while preserving current production behavior behind adapters.

---

# Recommended Phase 1 proving slice after those gates

Coding remains the strongest first vertical slice because it exercises nearly every universal QIR concern in one bounded mission:

```text
User goal
-> durable Run created
-> plan step persisted
-> existing Model Fabric selects/executes attempt
-> generated VFS becomes candidate artifact generation
-> existing compiler/Preview return observations
-> existing Coding/build verifier returns evidence
-> normalized failure triggers QIR Recovery when needed
-> verified generation is promoted/checkpointed
-> Outcome Engine evaluates mission contract
-> UI derives Run state
-> refresh/new worker resumes from persisted Run without replaying the whole transcript
```

The slice should reuse current providers, VFS, compiler, Preview, proof-control-plane and repair machinery. The architectural proof is **who owns the loop and survives failure**, not whether Quantora can generate another website.
