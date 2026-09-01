# QIR Phase 0 — Execution Spine Truth Audit

This is the first implementation workstream under the locked Quantora Intelligence Runtime architecture.

## Objective

Establish one factual map of the existing execution path from user goal to outcome before moving responsibilities into QIR.

The audit is not a feature review. It is an ownership review of state, retries, model selection, artifact mutation, persistence, budgets, evidence, and completion.

## Hot path to audit

```text
User input
-> frontend request construction
-> intent / request normalization
-> conversation decision
-> model selection / route planning
-> provider execution / failover
-> output contract parsing
-> artifact/VFS creation or mutation
-> tool/API execution
-> verifier
-> repair/refinement
-> compiler/runtime/preview where applicable
-> outcome state
-> user-visible completion
```

## Mandatory questions at every boundary

For each function/module/component on the path, record:

1. What state does it own?
2. Is that state durable, request-local, browser-local, process-local, or reconstructed?
3. Can it select or change a model/provider?
4. Can it retry or heal?
5. Can it mutate an artifact?
6. Can it declare success/ready/done/complete?
7. What evidence does it observe before doing so?
8. What timeout/deadline controls it?
9. What happens when the process dies?
10. What happens when the browser refreshes?
11. What happens when the provider fails or quota is exhausted?
12. Is another module making the same decision independently?

## Initial modules requiring line-by-line inspection

### Frontend / run initiation

- `src/hooks/useChatStream.js`
- request/session/outcome helpers used by the hook
- Coding Desk / Studio continuation logic
- any component that owns local `running`, `ready`, `failed`, retry, or healing state

### Shared intent and continuation

- `shared/build-intent.js`
- `shared/workspace-intent.js`
- `shared/request-kind.js`
- `shared/session-context*`
- `shared/studio-continues*`
- `shared/refinement-loop.js`

### Backend hot path

- `api/_lib/chat-handler.ts`
- `api/_lib/communication/request-normalizer.ts`
- `api/_lib/conversation-engine*`
- `api/_lib/conversation-policy.ts`
- `src/lib/communication/routing/*`
- inference route planner/provider execution helpers
- model registry/model store/circuit/spend helpers

### Artifact / verification / repair

- build response contract validators
- artifact/VFS parsers and mutation helpers
- `api/_lib/verify-build.ts`
- `api/_lib/repair.ts`
- `shared/refinement-loop.js`
- outcome-state client/server implementations

### Runtime / Preview

- `src/components/ProjectRuntimePreview.jsx`
- `src/components/LivePreviewCanvas.jsx`
- preview compiler and iframe protocol
- preview warming/remount/recovery helpers

### Existing reliability gates

- golden transaction scripts
- browser release gates
- turn-heal contract tests
- provider failover/circuit tests
- preview failure/recovery tests

## Required outputs

### A. Current-state ownership matrix

At minimum:

| Concern | Current owner(s) | Durability | Can mutate? | Can declare complete? | Evidence | QIR destination |
|---|---|---|---|---|---|---|
| Goal | TBD | TBD | TBD | TBD | TBD | Cognition Kernel |
| Run status | TBD | TBD | TBD | TBD | TBD | Durable Agent Runtime |
| Model route | TBD | TBD | TBD | n/a | TBD | Model Fabric |
| Retry | TBD | TBD | TBD | n/a | TBD | Kernel + Runtime |
| Context | TBD | TBD | TBD | n/a | TBD | Context Manager |
| Artifact generation | TBD | TBD | yes | no | TBD | Tool/Execution Fabric |
| Artifact mutation | TBD | TBD | yes | no | TBD | Candidate artifact protocol |
| Verification | TBD | TBD | no | yes | TBD | Outcome Engine |
| Budget | TBD | TBD | no | no | TBD | Resource Governor |
| Completion copy | TBD | TBD | no | currently? | TBD | Derived from RunState |

### B. Duplicate-authority list

Every case where two or more places independently decide the same architectural fact, especially:

- build/continue intent;
- run status;
- retry eligibility;
- fallback selection;
- artifact readiness;
- completion;
- timeout/budget;
- memory/context ownership.

Each duplicate receives one disposition:

`MOVE TO QIR`, `DERIVE ONLY`, `ADAPTER`, `DELETE AFTER MIGRATION`, or `KEEP DOMAIN LOCAL`.

### C. Failure-domain map

Normalize current failures into structured classes such as:

```text
USER_INPUT_REQUIRED
POLICY_BLOCK
PROVIDER_AUTH
PROVIDER_QUOTA
PROVIDER_TIMEOUT
PROVIDER_TRANSPORT
MODEL_CONTRACT
TOOL_TIMEOUT
TOOL_FAILURE
ARTIFACT_INVALID
COMPILE_FAILURE
RUNTIME_FAILURE
VERIFICATION_FAILURE
BUDGET_WAIT
CAPACITY_WAIT
INTERNAL_INVARIANT
```

The audit must identify where each current raw error becomes one of these classes and whether it is recoverable.

### D. Persistence-gap list

List every piece of state whose loss would make another worker/model unable to continue the run.

Examples:

- current plan;
- attempted routes;
- verified facts;
- artifact generation/version;
- last verified checkpoint;
- unresolved verifier findings;
- remaining budget;
- pending user question;
- tool result/provenance.

### E. Completion-authority inventory

Search the repository for every path capable of rendering or setting concepts equivalent to:

`ready`, `done`, `complete`, `proved`, `success`, `clean`, `finished`.

For each, determine whether it is a local UI/rendering state or a claim about the user's outcome. The latter must eventually derive from the QIR Outcome Engine only.

## Audit rules

- Do not infer architecture from comments alone; verify the executable path.
- Do not change behavior while mapping it unless a P0 security/data-loss issue is discovered.
- Do not add domain-specific fixes during Phase 0.
- Do not merge a migration until a was-red gate proves the architectural defect being removed.
- Preserve existing production behavior until the equivalent QIR path is independently proven.
- Every proposed deletion must name its replacement authority.

## Exit criteria

Phase 0 is complete only when we can answer, without guessing:

1. Where is the user's goal stored?
2. Where is the current run state stored?
3. Who decides the next action?
4. Who chooses and changes models?
5. Who invokes tools?
6. Who owns retries and stopping?
7. Where is context compacted and persisted?
8. Who owns budgets and recovery reserve?
9. Who owns artifact versions/checkpoints?
10. Who alone may declare the outcome complete?
11. Can another worker resume after a crash without replaying the whole conversation?
12. Which existing modules will be migrated, wrapped, derived, or deleted?

Until all twelve have factual answers, QIR implementation does not advance to Phase 1.
