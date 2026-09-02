# QIR Phase 0 — Capability Surface and Side-Effect Map

Status: **IN PROGRESS**  
Audit target: production execution spine on `main` at `2c19d6dc17558e120da1e8b097958785c512833b`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

This is a behavior-neutral audit artifact. It maps current domain capabilities into future QIR roles and identifies where a capability is already a good tool/verifier primitive versus where it still behaves as an independent mini-orchestrator.

---

## 1. Executive finding

The repository has more reusable QIR organs than the earlier hot-path audit alone made visible.

Across Office, Research, Study, Finance, Travel and publishing, Quantora already contains strong domain primitives:

- deterministic calculators and data gateways;
- real provider adapters;
- independent verifiers;
- PCL human-approval and evidence recording for consequential actions;
- artifact compilation and validation;
- provider resilience and circuit breakers;
- explicit refusal rather than fabricated success.

The problem is **where orchestration authority lives**. Today capabilities enter production through several incompatible shapes:

1. a model/tool loop inside `/api/chat` (Travel);
2. a direct request-local artifact mini-runtime (`/api/generate-office`);
3. deterministic pre-chat gateways that can consume a Finance turn before normal chat;
4. board-triggered verification tasks multiplexed through chat (Research);
5. domain verification/release functions called from Study logic;
6. direct side-effect endpoints for deploy/domain/GitHub operations.

QIR should not replace these capabilities. It should give them one typed execution contract, one durable run context, one budget/recovery governor, one side-effect authorization seam and one Outcome Engine.

---

## 2. Office — mature artifact tool, local orchestration

### Confirmed current behavior

`api/generate-office.ts` is effectively a self-contained request-local artifact runtime for PowerPoint, Word and Excel.

It owns:

- create/refine/compile-only modes;
- authentication/BYOK/server-key selection;
- request/spec limits and rate limits;
- provider order and failover;
- attempt budgeting and stopping;
- provider call timeout;
- JSON parse/repair and semantic gates;
- deterministic compilation;
- final artifact verification;
- revision fingerprints;
- binary + preview response packaging.

A generated Office artifact is not returned when final verification fails: the endpoint returns `422` and explicitly withholds a degraded file. Successful output includes the verifier result and the fingerprint that ties the binary to its preview/spec.

### QIR classification

**KEEP almost all of the Office artifact machinery.** It is exactly the kind of capability QIR should invoke as a typed `artifact.create/refine/compile` tool.

Move out of the Office endpoint over time:

- run-level retry ownership;
- cross-provider recovery strategy;
- run/recovery/premium budgets;
- global completion semantics.

Keep inside the Office adapter:

- format-specific schemas;
- validation;
- deterministic compile;
- artifact envelope/fingerprint verification;
- provider-specific request adaptation;
- low-level provider timeout as a safety bound.

### Completion rule

`verification.passed === true` means **the Office artifact is verified**, not that the user's whole mission is complete. QIR records it as artifact evidence and then evaluates the mission Outcome Contract.

---

## 3. Research — verifier pattern is already close to QIR ideal

### Confirmed current behavior

`api/_lib/research-verify.ts` deliberately makes the model a **proposer, not the adjudicator**:

1. source URLs are admitted and fetched;
2. a model proposes a verbatim evidence passage + stance;
3. deterministic verification checks that the passage actually exists in the fetched source;
4. claims become `supported`, `contested`, or `unverified`;
5. contradictory evidence is preserved rather than averaged away;
6. unreachable sources or proposer failure result in `unverified`, never fabricated evidence.

The Research Board invokes this via a `task: "research-verify"` request multiplexed through `/api/chat`.

### QIR classification

**KEEP/PROMOTE as a Research verifier adapter.** This is the correct architecture for independent evidence validation.

The only migration required is control-plane placement: the board should eventually request a QIR verification step/run event rather than knowing that the verifier is hidden inside the chat endpoint.

### Completion rule

A verified claim is evidence. A set of verified claims may satisfy Research-specific Outcome Contract checks. Neither the proposer nor Research Board owns mission completion.

---

## 4. Study — a real domain verification runtime already exists

### Confirmed current behavior

Study has a provider-neutral verification runtime in `api/_lib/study-verification-runtime.ts` that executes only concrete verifier implementations that actually exist:

- numeric verifier;
- symbolic verifier;
- grounded-source verifier;
- reviewed-assessment verifier.

A required verifier with missing input or missing implementation returns `insufficient`; it is never silently promoted to success.

`study-assessment-governance.ts` then uses this verification runtime as the release gate. Reviewed static assessment items can earn a verified attempt; parametric/generated families remain blocked until instance-level verification exists. The release decision is wired into assessment selection and mastery-evidence admission.

### QIR classification

**KEEP this verification architecture.** It is another strong example of a domain evidence adapter underneath the universal Outcome Engine.

Study does **not** need a second agent runtime. Its verification plan and concrete verifiers become typed QIR verification capabilities.

### Important separate finding

`AdvisorDomainRegistry` is a promising provider-neutral advisor contract, but code search still shows the registry itself in the wiring baseline rather than a production execution path. Documentation mentions a Study repository advisor adapter, but the audit has not yet found its executable registration. Until executable wiring is found, treat the registry as architecture/contract code, not production runtime authority.

---

## 5. Finance — deterministic capability quality is strong, but ordering is a parallel orchestrator

### Confirmed production entry path

Before ordinary `/api/chat` execution, `api/pipeline.ts` gives a sequence of Finance-only deterministic gateways first refusal:

- affordability decision;
- FX forecast;
- FX analytics;
- equity signal;
- market-data lookup;
- debt crisis;
- debt plan;
- savings goal;
- financial profile;
- Finance advisor.

Any one can consume the turn and return before the normal chat runtime.

`finance-gateway-guard.ts` exists because these gateways execute **before** the normal chat runtime and outside its try/catch. On an unexpected throw it either falls through to chat before streaming starts or terminates an already-open stream cleanly.

### Valuable primitives

This chain contains strong QIR-worthy tools. For example, `market-data-gateway.ts`:

- resolves Finance intent;
- prefers real live FX/quote providers;
- checks freshness;
- falls back to stored sourced data;
- distinguishes invalid symbols from outages;
- refuses rather than letting an unsourced market figure fall into the LLM path;
- emits deterministic next moves.

`financial-profile-gateway.ts` is a different category: it is an **internal state mutation/read tool**. An explicit user command such as setting a goal/risk/horizon/balance-sheet value writes an owner-scoped user-context node and returns the resulting profile.

### QIR classification

**KEEP the deterministic Finance engines; remove their independent orchestration authority over time.**

Target mapping:

- intent recognizers -> signals to Cognition Kernel;
- calculators/market providers -> typed read-only tools;
- profile writes -> typed internal memory/state tools;
- Finance advisor synthesis -> advisor/analysis capability;
- gateway ordering -> QIR plan/next-action decision, not a fixed pre-chat chain;
- `guardFinanceGateway` -> transitional request-safety wrapper, not long-term runtime recovery authority.

### Why this matters

Finance currently demonstrates that “deterministic before model” is valuable, but the **decision to consume the turn** is still encoded in a domain-specific chain. QIR should preserve determinism without preserving a second orchestrator.

---

## 6. Publishing / domains — strongest existing PCL side-effect pattern

### Confirmed current behavior

`guardPclSideEffect(...)` is already a generalized authorization seam for external/consequential adapters. It:

- converts an adapter action into PCL action/cognition semantics;
- creates a stable action reference from tool + arguments + scope;
- checks exact-action authorization;
- supports durable approval/evidence when Outcome Memory consent exists;
- supports **ephemeral first-party human confirmation** when durable memory consent does not exist;
- keeps approval for one exact side effect rather than interpreting generic conversational assent.

`pclHumanConfirmation(...)` only accepts an allowlisted first-party UI confirmation source.

`recordPclExecutionEvidence(...)` can attach provider/tool evidence to the PCL cognitive ledger when durable memory is enabled.

### Production adapters already using it

- Vercel production publish/share-preview (`api/deploy.ts`);
- custom-domain connection (`api/domains.ts`);
- GCP deployment (`api/deploy-gcp.ts`).

The Vercel publish path is especially close to the desired QIR protocol:

`explicit UI confirmation -> PCL authorization -> provider call -> provider result -> execution evidence`.

### QIR classification

**PROMOTE this existing seam; do not invent a competing approval system.**

In QIR it should sit inside the universal Tool Executor for side-effecting tools. The Durable Agent Runtime owns when a tool step is proposed; PCL owns authorization policy; the adapter executes; provider evidence returns as an Observation.

---

## 7. GitHub PR writes — authenticated and allowlisted, but outside the common PCL side-effect seam

### Confirmed current behavior

GitHub write endpoints are protected by important controls:

- active Quantora session required;
- server GitHub token required;
- repository must appear in `GITHUB_ALLOWED_REPOS`;
- inputs are normalized;
- provider requests are deadline-bounded.

The Coding Desk exposes **Create PR** as an explicit user button. The merge endpoint exists server-side, but repository documentation says it is not yet exposed as a one-click desk button.

### Architectural inconsistency

At the server adapter level, `github-create-pr` and `github-merge-pr` currently call GitHub directly from `pipeline.ts`. Unlike deploy/domain/GCP write paths, they do not pass through `guardPclSideEffect(...)` and do not produce a PCL actionRef + execution-evidence record through that seam.

This is **not being classified as a Phase 0 emergency security fix**: the endpoints are authenticated and repo-allowlisted, and Create PR is reached from an explicit button. It is, however, a confirmed duplicate authorization/evidence pattern that QIR should eliminate.

### QIR disposition

**WRAP GitHub external writes behind the same universal PCL side-effect executor during migration.**

Suggested future tool classes:

- `github.repository.inspect` — read-only;
- `github.pull_request.create` — external, reversible/partial, explicit action evidence;
- `github.pull_request.merge` — consequential/hard-to-reverse, explicit approval required;
- future push/delete/branch protection changes — individually classified by risk/reversibility.

Do not implement this behavior change during Phase 0.

---

## 8. Project State and Outcome State — memory inputs, not Agent Run persistence

### Project State

The project store persists:

- project identity/name/goal/status;
- project resources;
- project-session links;
- a context pack synthesized from linked Outcome States.

It uses versioned save semantics and owner scoping. This is valuable **project semantic memory**.

### Outcome State

Outcome State persists user-approved/consented semantic state and Cognitive Ledger data. Saves require explicit memory consent and use optimistic version checks.

This is valuable **session/outcome semantic memory**.

### QIR requirement

Neither may be repurposed as the Agent Run journal merely because they are already durable.

The run journal must persist operational facts required to continue active work, including:

- run state;
- current plan/step;
- attempt ids and route/tool history;
- observations/failures;
- pending human gate/question;
- candidate + verified artifact generation ids;
- checkpoints;
- budget/recovery reserve;
- event sequence / resume cursor.

Personal/Outcome Memory consent and necessary operational run retention are separate contracts.

---

## 9. Capability migration matrix

| Current capability | What is already good | Current authority problem | QIR destination |
|---|---|---|---|
| Office generation/compile | schemas, provider adapters, validation, compile, artifact verifier | owns request-local provider retry/budget + local success | `artifact_generation` tool + Office verifier |
| Research verification | model proposes, deterministic evidence verifies | board knows a special chat task | Research verifier adapter |
| Study verification runtime | explicit plan, concrete verifiers, fail-insufficient | domain-local release/completion vocabulary | Study evidence/verifier adapters |
| Finance market/calculators | deterministic, sourced, refusal over hallucination | fixed pre-chat gateway chain owns turn interception | Tool Fabric + Cognition plan |
| Finance profile writes | explicit, owner-scoped state update | custom internal mutation path | internal state/memory tool |
| Travel tool adapters | provider-backed, validated, resilient, no mocks | request-local Travel agent loop | Tool Fabric adapters |
| Vercel publish/domain/GCP | PCL exact-action authorization + provider evidence | still individual endpoint execution | universal side-effect Tool Executor |
| GitHub PR create/merge | auth, allowlist, provider response | bypasses common PCL side-effect/evidence seam | wrap in universal side-effect Tool Executor |
| Project/Outcome stores | durable semantic state, owner/version controls | not execution journal | Project/Outcome Memory inputs |
| Advisor registries | provider-neutral contracts | registry wiring incomplete/unproven | Cognition/Advisor capability registry after wiring |

---

## 10. Universal Tool contract inferred from working code

The strongest existing adapters imply the following minimum QIR tool result. This is an architectural synthesis, not a Phase 0 implementation:

```ts
interface QirToolObservation<T> {
  invocationId: string;
  runId: string;
  stepId: string;
  tool: string;
  status: 'success' | 'unavailable' | 'failed' | 'waiting_for_user';
  executed: boolean;
  output?: T;
  evidence: Array<{
    ref: string;
    kind: string;
    source: string;
    observedAt: string;
  }>;
  failure?: QirFailure;
  provider?: {
    id: string;
    attempt: number;
    latencyMs?: number;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    computeMs?: number;
  };
}
```

The crucial invariant is not the exact TypeScript shape. It is:

> A tool does not decide what Quantora does next and does not decide that the user's goal is complete. It returns an Observation. The Durable Runtime + Cognition Kernel decide the next action; the Outcome Engine decides completion.

---

## 11. Side-effect classes for the future universal executor

| Class | Examples today | Default QIR handling |
|---|---|---|
| pure/read-only | market quote, FX lookup, research source fetch, Travel search | autonomous within policy/budget |
| internal reversible | save explicit Finance profile field, create candidate artifact/checkpoint | execute with trace; inform when material |
| external reversible/partial | create PR, create share preview | exact-action authorization policy + evidence |
| external hard-to-reverse | production deploy, connect domain, merge PR | explicit approval immediately before execution + provider evidence |
| transactional/destructive | booking/payment/delete/revoke | explicit approval, stronger policy, idempotency/provider confirmation; otherwise fail closed |

The current Travel transaction refusal and PCL publishing guard are the two strongest existing precedents for this policy.

---

## 12. Phase 0 decisions strengthened by this pass

1. **Do not build new domain orchestrators.** Every useful domain engine becomes a capability or verifier behind QIR.
2. **Do not build a second authorization framework.** `guardPclSideEffect` is the seed for the universal side-effect gate.
3. **Do not equate domain verification with mission completion.** Office/Research/Study/Coding/Preview verification all feed the Outcome Engine.
4. **Do not equate semantic memory with execution durability.** Project/Outcome/User Context remain memory layers; Agent Run gets a separate journal.
5. **Do not remove deterministic Finance logic.** Remove only its independent turn-orchestration authority as migration proves the QIR equivalent.
6. **Normalize GitHub writes into the same side-effect/evidence protocol** when Phase 1 reaches external tool execution.
7. **Preserve fail-closed behavior.** Missing provider data, missing verifier implementation, failed compilation and disabled transactions must remain incapable of producing a false success.

---

## 13. Remaining Phase 0 work

Still required before Phase 1:

- exhaustive completion-claim inventory across executable code/UI;
- complete list of state stores and retention boundaries (session, user-context, project, outcome, model quality, product/usage, artifacts);
- model/provider usage and quality telemetry mapping to QIR Step/Attempt records;
- external side-effect inventory beyond the currently confirmed Vercel/GCP/domain/GitHub paths;
- release/golden-transaction inventory mapped to **goal-level** outcomes rather than only component health;
- final authoritative KEEP / MOVE / WRAP / DERIVE / DELETE table;
- factual answers to all twelve Phase 0 exit questions.

Until those are complete, PR #446 remains draft and production runtime migration does not begin.
