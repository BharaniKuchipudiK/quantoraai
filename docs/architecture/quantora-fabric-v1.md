# Quantora Fabric v1 — Architecture Blueprint

Status: **Architecture decision — proposed for adoption**

## 1. The product decision

Quantora will **not** pivot into an IDE or a Cursor clone.

Software building remains a future capability of Quantora, but it is not the company thesis. Quantora's thesis is broader and structurally different:

> **One trusted personal context. Multiple expert capabilities. End-to-end outcomes.**

The platform owns the user's identity, context, permissions, goals, commitments, decisions, evidence, actions and outcomes. Domain capabilities such as Travel, Finance, Research, Education and Build run on top of that shared fabric.

This document defines the architectural contract required to make that true.

---

## 2. What Quantora is — and is not

Quantora is an **outcome platform**.

A user arrives with an intent:

- plan and complete a trip;
- restructure debt;
- evaluate an investment decision;
- research a major purchase;
- prepare and ship a work artifact;
- build software.

Quantora should move that intent through a common lifecycle:

```text
INTENT
  -> CONTEXT
  -> CONSTRAINTS
  -> PLAN
  -> DECISION
  -> APPROVAL
  -> ACTION
  -> VERIFICATION
  -> OUTCOME
  -> FOLLOW-UP / LEARNING
```

Quantora is **not**:

- a collection of independent chatbot personas;
- an agent marketplace;
- a Common Context Bus implemented as a giant JSON table;
- a model-specific product;
- a Google / Gemini wrapper;
- a Cursor clone;
- a system that exposes chain-of-thought as a trust mechanism;
- a system that acts consequentially without explicit policy and approval.

The internal analogy may eventually resemble an operating layer for personal AI, but we do not claim "AI Operating System" merely because capabilities share context. That description must be earned by common platform services and repeated successful outcomes.

---

## 3. The six pillars

Every new feature must strengthen at least one of these pillars or complete a real user outcome.

### Pillar 1 — Context Fabric

The durable, permissioned representation of the user's world.

Contains typed nodes for:

- facts;
- preferences;
- goals;
- constraints;
- commitments;
- events;
- decisions;
- outcomes;
- evidence;
- permissions;
- source provenance;
- confidence;
- freshness / validity windows.

It does **not** store arbitrary agent scratchpads as trusted truth.

The existing User Context Graph, Project Context Graph, Outcome State and Cognitive Ledger are foundations of this pillar. They should converge under a consistent context contract rather than be replaced by another memory system.

### Pillar 2 — Orchestration & Intent

A provider-independent orchestrator decides:

1. What is the user trying to achieve?
2. Which outcome is currently active?
3. Which context slice is relevant?
4. Which capability or capabilities are required?
5. Which deterministic tools are required?
6. What policy / permission / approval applies?
7. How will completion be verified?

The orchestrator coordinates. It does not own domain business logic and should not turn into an unbounded chain of agents talking to agents.

### Pillar 3 — Capability Framework

Travel, Finance, Research, Education and Build are **capabilities**, not independent products with private memory.

Each capability declares a typed manifest:

```ts
type CapabilityManifest = {
  id: string;
  version: string;
  intents: string[];
  requiredContext: ContextSelector[];
  optionalContext: ContextSelector[];
  tools: string[];
  riskClass: "low" | "medium" | "high";
  supportedActions: string[];
  verification: VerificationRule[];
};
```

A capability may internally use one model, multiple models, deterministic services, or sub-agents. That is an implementation choice hidden behind the capability contract.

Capabilities must not:

- create their own parallel user profile;
- directly bypass policy gates;
- directly couple themselves to a vendor-specific API throughout the codebase;
- silently persist inferred facts as trusted context.

### Pillar 4 — Connector / Tool Gateway

External providers are interchangeable adapters behind stable Quantora tool contracts.

Examples:

```text
search_flights()
search_hotels()
get_market_quote()
get_bank_transactions()
read_calendar_availability()
search_mail_evidence()
send_message()
create_reservation()
```

A capability asks for a semantic tool. The Tool Gateway selects the provider.

Travel must not be coded around Duffel everywhere. Finance must not be coded around one market-data vendor everywhere. Google, Microsoft, WhatsApp, banks, brokers and future providers are adapters.

Each tool execution produces evidence:

```ts
type ToolResult<T> = {
  ok: boolean;
  provider: string;
  data?: T;
  evidenceRef?: string;
  observedAt: string;
  expiresAt?: string;
  error?: ToolError;
};
```

No tool result becomes durable personal truth without provenance and the applicable trust policy.

### Pillar 5 — Policy, Consent & Execution

Reasoning and execution are separate.

Before an action can occur, Quantora determines:

- user identity;
- data permission;
- capability permission;
- jurisdiction / regulatory restriction where applicable;
- financial or reputational impact;
- reversibility;
- whether explicit human approval is required;
- idempotency / replay protection.

Core execution principle:

> **Models may propose consequential actions. Models do not authorize consequential actions.**

The existing PCL execution gates, side-effect guards, authz and explicit approval mechanics should become shared Fabric services.

### Pillar 6 — Outcome & Verification Engine

The durable unit of value is an Outcome, not a chat.

```ts
type Outcome = {
  id: string;
  userSub: string;
  capabilityId: string;
  goal: string;
  state:
    | "discovered"
    | "planned"
    | "awaiting_approval"
    | "executing"
    | "verifying"
    | "resolved"
    | "blocked"
    | "cancelled";
  constraints: ContextRef[];
  decisions: DecisionRef[];
  actions: ActionRef[];
  evidence: EvidenceRef[];
  verification: VerificationState;
  nextBestStep?: string;
  createdAt: string;
  updatedAt: string;
};
```

Every meaningful flow should end in one of four honest states:

- resolved;
- blocked with a clear blocker;
- cancelled by the user;
- awaiting a named next step.

"Done" is not a model statement. It is a verified state transition.

---

## 4. Reference architecture

```text
                         QUANTORA

+-------------------------------------------------------------+
| EXPERIENCE LAYER                                            |
|                                                             |
| Home / Outcomes / Projects / Activity                       |
| Travel | Finance | Research | Education | Build             |
+---------------------------+---------------------------------+
                            |
                    QUANTORA ORCHESTRATOR
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
        CONTEXT FABRIC  CAPABILITIES  POLICY / CONSENT
              |             |             |
              +-------------+-------------+
                            |
                      TOOL GATEWAY
                            |
    +----------+--------+---------+---------+----------+
    | Banks    | Google | Travel  | Markets | Messaging|
    | Brokers  | Mail   | APIs    | Data    | Payments |
    +----------+--------+---------+---------+----------+
                            |
                     EXECUTION ENGINE
                            |
                    HUMAN APPROVAL GATE
                            |
                     OUTCOME ENGINE
                            |
                    VERIFY / FOLLOW-UP
                            |
                            +----> Context Fabric
```

The UI may present domain-specific workspaces, but the system underneath remains one Fabric.

---

## 5. Common Context Bus — what we keep from the idea

The useful concept is **shared context**, not a literal bus.

Bad implementation:

```text
agent_a -> live_user_constraints JSON
agent_b -> live_user_constraints JSON
agent_c -> live_user_constraints JSON
```

This quickly loses ownership, meaning, freshness, provenance and trust.

Quantora instead uses typed context nodes with explicit ownership and lifecycle.

A capability receives a **context projection**, not the user's entire life graph.

Travel may receive:

```json
{
  "tripBudget": { "amount": 6000, "currency": "SGD", "hard": true },
  "travellers": 4,
  "availableDates": ["2026-10-12", "2026-10-19"],
  "directFlightPreference": "strong",
  "hotelMinimumStars": 4
}
```

Finance may receive a different projection.

The Context Fabric enforces data minimization by design.

---

## 6. Model strategy

Quantora is model-independent.

Models are selected per task by capability, cost, latency and quality requirements.

Allowed model roles include:

- intent classification;
- planning;
- synthesis;
- extraction;
- grounded research;
- explanation;
- ranking.

Models must not own:

- arithmetic that can be deterministic;
- authorization;
- balances or prices that have authoritative sources;
- irreversible execution state;
- user identity;
- outcome completion state.

Model output is a proposal or interpretation until verified by the relevant layer.

---

## 7. Deterministic computation

Financial calculations, budgets, portfolio metrics, debt schedules, date calculations, price comparisons and policy rules should run as ordinary deterministic services/functions when possible.

We do **not** create a Vertex Notebook for every calculation.

Use a sandboxed code execution environment only when the problem genuinely requires generated computation that cannot be represented by a maintained deterministic function. Generated code must have bounded resources, controlled network access and captured outputs.

User trust should be shown through:

- inputs;
- assumptions;
- evidence;
- calculations;
- confidence / uncertainty;
- what would change the answer.

Do not expose private chain-of-thought.

---

## 8. Proactivity

Proactivity is part of the Fabric, not a separate "Shadow Agent."

A proactive trigger is:

```ts
type Trigger = {
  source: "schedule" | "event" | "data_change" | "outcome_deadline";
  selector: string;
  condition: string;
  cooldown: string;
  permissionScope: string;
};
```

Trigger -> context -> relevance policy -> capability -> proposal -> approval/action -> outcome.

Rules:

- no activity merely to create engagement;
- no background inference saved as truth without provenance;
- no consequential execution without the applicable approval;
- quiet hours and notification budgets;
- every proactive item must answer "why is this relevant now?".

---

## 9. Experience architecture

Chat remains a universal command surface, but it is not the product shell.

Each capability can own a domain-specific workspace.

Examples:

### Travel

- trip brief;
- budget / constraints;
- flight comparison;
- hotel comparison;
- itinerary;
- bookings;
- confirmation documents;
- live trip changes;
- outcome status.

### Finance

- financial baseline;
- liabilities;
- portfolio;
- cash-flow constraints;
- scenario modelling;
- recommendations;
- evidence / calculations;
- regulated-provider handoff where required;
- outcome status.

The sidebar label "Specialized Agents" should eventually become a user-facing concept such as **Capabilities**, **Experts** or domain workspaces. The internal implementation must not leak into the product vocabulary.

---

## 10. Current Quantora code — KEEP / REFACTOR / MISSING

### KEEP and strengthen

These existing areas align strongly with Fabric:

- `api/_lib/user-context-*` — seed of account-level Context Fabric;
- `project-context-*` — project scope;
- `outcome-state*` — durable outcome state;
- `cognitive-ledger*` — durable decision / correction lineage;
- `conversation-engine*` — seed of orchestration;
- `pcl-*` execution / governance — seed of Policy & Consent;
- `agent-tools.ts` — seed of Tool Gateway;
- `verify-build` and response verification — seed of Verification Engine;
- model registry / routing — provider-independent model selection;
- explicit human approval / side-effect guards.

### REFACTOR deliberately, not immediately

1. **Frontend/backend duplicate contracts** -> converge into `shared/` as already planned in `ARCHITECTURE.md`.
2. **Agent terminology** -> migrate internal contracts toward capabilities; do not rename everything in one destructive PR.
3. **Tool adapters** -> split semantic tool contracts from provider implementations.
4. **Outcome State / Project Context / User Context** -> define common references and provenance rules while preserving scopes.
5. **`api/chat` as hot path** -> orchestrator should become request-surface independent so capabilities can be invoked from workspace UI, background triggers and future channels without pretending every operation is chat.

### MISSING — Fabric gaps

1. `CapabilityManifest` registry.
2. Typed `ContextSelector` / context projection service.
3. Provider-neutral Tool Registry / adapter resolver.
4. First-class Outcome object shared across domains.
5. Action registry with risk / reversibility / approval metadata.
6. Evidence registry and freshness model.
7. Trigger / proactive scheduling contract.
8. Capability-level evaluation suites.
9. Entitlement layer for Free vs paid Fabric features.
10. Connector permission vault / consent registry by source and scope.

---

## 11. Build order

We will not build the complete infrastructure first.

The Fabric emerges through one complete vertical, with every reusable element extracted into a platform contract.

### Stage A — Fabric contracts

Build only the missing contracts required for the first vertical:

1. Capability registry.
2. Context projection.
3. Tool registry + provider adapters.
4. Outcome lifecycle.
5. Action / approval contract.
6. Evidence contract.

Do **not** add another serverless function merely for architectural cleanliness; preserve the existing Vercel function-budget constraint and put shared Fabric logic under reusable modules.

### Stage B — Travel as the first proof vertical

Why Travel first:

- users understand the outcome immediately;
- exercises search, external tools, comparison, preferences, budget, calendar, approval, transactions, confirmations, monitoring and follow-up;
- lower regulatory burden than full investment/debt execution;
- easy to demonstrate to investors;
- forces the Fabric to prove it can complete a real multi-step outcome.

Target outcome:

> "Take my family to Tokyo from 12–19 October, direct flights preferred, 4-star hotel, total budget SGD 6,000."

V1 must produce a verified, actionable trip plan from real providers. Booking execution is added only where provider and payment contracts are reliable.

### Stage C — Finance as the second proof vertical

Finance must reuse Fabric services created for Travel:

- identity;
- context;
- permissions;
- evidence;
- deterministic calculation;
- approval;
- outcomes;
- monitoring.

If Finance requires a second parallel memory / orchestration / approval system, the Fabric has failed.

### Stage D — Research / Education / Build

New capabilities should become progressively cheaper to add.

Software Build may eventually expose an IDE-like experience or integrate with external IDEs, but it runs as another Quantora capability. Quantora does not compete with Cursor feature-for-feature.

---

## 12. The reuse test

The platform claim is measurable.

After Travel V1, adding Finance should reuse at least these platform services without forks:

- authentication / identity;
- context retrieval / projection;
- permissions;
- outcome lifecycle;
- tool execution envelope;
- evidence;
- approval / replay protection;
- telemetry / evaluation.

Architecture KPI:

> **A second vertical should not rebuild the first vertical's platform services.**

The exact percentage is less important than preventing vertical forks, but we should expect the majority of non-domain infrastructure to be shared.

---

## 13. The $15/month product boundary

Architecture must support a clean entitlement model.

### Free

Primarily:

- ask / answer;
- limited domain capability;
- limited context;
- limited tool execution;
- trial of an outcome workflow.

### Quantora+ (target ~$15/month)

The paid value is not "better AI text."

The paid promise is:

> **Know me. Connect to my world. Work across my tools. Help finish outcomes.**

Paid platform services may include:

- durable cross-domain personal context;
- connected sources;
- proactive monitoring;
- higher tool / provider limits;
- multi-step outcome workflows;
- persistent outcome history;
- cross-domain constraints;
- premium verification / research;
- approved execution workflows;
- notification / follow-up automation.

The subscription should be defensible only if Quantora regularly creates more than the subscription price in saved time, avoided cost, better decisions or completed transactions.

Longer-term monetization can include transaction / referral / marketplace economics where legally and commercially appropriate. Subscription is not a substitute for product value.

---

## 14. Metrics the architecture must make observable

We should optimize for outcomes, not token volume.

Primary product metrics:

- completed outcomes per active user;
- outcome success rate;
- time to outcome;
- user acceptance / rejection of recommendations;
- connected sources per paid user;
- capabilities used per paid user;
- 30 / 90 / 180-day paid retention;
- value saved / influenced / transacted where measurable;
- proactive item usefulness rate;
- action failure / rollback rate;
- context correction rate.

Architecture / platform metrics:

- percentage of tool calls through provider-neutral contracts;
- percentage of context with provenance + freshness;
- capability reuse of shared Fabric services;
- model cost per completed outcome;
- connector failure rate;
- verification coverage of completed outcomes.

---

## 15. Security / privacy non-negotiables

1. Least-privilege connectors.
2. Per-source and per-capability consent scopes.
3. Encryption / secret isolation.
4. Server-side authorization for protected resources.
5. No browser-supplied owner identity trusted for writes.
6. Idempotency for consequential actions.
7. Explicit approval for high-impact actions.
8. Complete provenance for material context.
9. User-visible correction / deletion capability.
10. Data minimization in context projections.
11. Jurisdiction-aware gates for regulated capabilities.
12. Auditability without exposing private chain-of-thought.

---

## 16. Architecture rejection rules

Reject a proposal if it does any of the following without a demonstrated need:

- creates another independent memory system;
- creates another independent orchestrator;
- creates an agent solely because "multi-agent" sounds advanced;
- hard-codes a model provider into domain business logic;
- hard-codes a third-party provider throughout a capability;
- introduces BigQuery / vector search / fine-tuning before a measurable use case;
- spends cloud credits merely because they expire;
- exposes model chain-of-thought;
- adds a top-level Vercel function when the existing function budget can be preserved;
- stores inferred personal facts as trusted truth without provenance;
- declares an outcome complete without verification;
- adds an IDE feature solely to imitate Cursor.

---

## 17. Final architectural position

Quantora's defensible asset is **not its agents**.

Agents, models and providers are replaceable.

The platform asset is the combination of:

> **Context + Permissions + Capabilities + Tools + Decisions + Execution + Verified Outcomes**

The long-term moat, if Quantora earns one, is a longitudinal, permissioned understanding of how a user makes consequential decisions across domains, connected to the ability to complete those outcomes.

That is the architecture we build from here.
