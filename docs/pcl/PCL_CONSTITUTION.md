# PCL Constitution

Status: Protected baseline
Owner: Quantora platform
Scope: PCL cognitive governance, outcome continuity, memory, routing, anticipation, response planning, and execution authorization

## Purpose

The PCL is Quantora's protected intelligence and governance layer. Its job is not merely to remember a conversation. It maintains continuity of the user's mission: the current outcome, decisions, constraints, rejected directions, corrections, evidence, artifacts, unfinished work, and the human approvals that govern consequential action.

The architectural loop is:

**Understand → Judge → Act → Verify → Remember**

Models generate language and proposals. Adapters perform capabilities. The PCL owns continuity, judgment, human governance, and the definition of the outcome.

The PCL is not a model, adapter, artifact renderer, or second chat transcript store.

## Non-negotiable invariants

1. The current user turn outranks stale history when intent conflicts.
2. A downstream adapter may consume a PCL decision but may not rewrite cognitive policy or authoritative mission history.
3. Models may propose intent, memory, and actions; the PCL validates and decides.
4. No action may be claimed as completed without execution evidence from the responsible adapter.
5. No consequential or hard-to-reverse side effect may execute merely because a model requested it.
6. Memory is selective. Raw transcripts are not permanent cognitive memory.
7. **There is one canonical PCL memory authority:** Session Outcome State + Project Outcome Graph + Cognitive Ledger. Local model-health, preference, failover, or response-quality signals are experience telemetry and may not become authoritative mission history.
8. Durable Session Outcome Memory is explicit and revocable. Session identity may be carried for continuity, but durable session writes require an existing consent flag or explicit user remember intent; revoke/forget disables consent immediately.
9. Project Outcome Graph, session Outcome State, ephemeral browser context, workspace state, artifact metadata, and model-experience telemetry remain distinct sources with explicit authority.
10. Authoritative continuity follows this precedence for current work: **session Outcome State → Project Outcome Graph → ephemeral SessionContext**. Project context may enrich a session but may not overwrite a more specific session decision.
11. Browser-supplied ephemeral context may help the current turn but may not manufacture durable decisions, approvals, rejections, corrections, or evidence.
12. The Cognitive Ledger is append-oriented judgment history. A normal Outcome State replacement may not silently erase prior cognitive history.
13. Active corrections and rejections remain first-class context. A rejected direction must not be casually resurrected unless the user explicitly reopens it.
14. Proactive behavior must be useful, timely, reversible, and proportionate. When a genuinely material choice is missing, ask exactly one focused question.
15. Office, Studio/preview, GitHub, search, and other integrations are isolated adapters behind explicit artifact or tool requests.
16. Every executable external side-effect adapter must pass through the shared PCL execution-authorization seam before contacting its provider. Individual adapters may not invent private approval logic.
17. Every production change that touches routing, memory, context, cognition, human governance, or response planning must pass the golden transaction suite.

## Provider-neutral cognitive contract

The PCL must remain model-independent. Switching model/provider must not reset mission state or alter the human-governance rules.

Each turn resolves to a provider-neutral cognitive assessment containing, at minimum:

- current goal and outcome alignment
- active authority scope: session, project, session+project, or ephemeral
- relevant confirmed and inferred context
- material unresolved question, if any
- existing decisions and rejected/corrected directions
- available artifacts and verification evidence
- next action and action consequence
- risk and reversibility
- decision confidence
- completion and evidence coverage
- human gate
- selected conversational move

The provider receives policy and bounded context, not ownership of state.

## Human-in-the-loop governance

The PCL uses four human gates:

### NONE

Safe, reversible, sufficiently understood work proceeds without unnecessary questions.

### INFORM

The work is reversible but carries material uncertainty or medium impact. Quantora may proceed with the smallest reasonable reversible assumption while making the material assumption visible.

### CHOOSE

A material ambiguity, conflict, or missing dependency can meaningfully change the outcome. Ask one concise question that resolves the highest-impact choice, then wait.

### APPROVE

The action is consequential, high risk, transactional, externally committing, or hard to reverse. Do not perform the side effect until explicit human approval exists for that concrete action.

Human-in-the-loop means the human governs consequential decisions; it does not mean asking permission for every safe action.

A first-party confirmation control may authorize the current exact action even when durable Session Outcome Memory is off. In that case the approval is request-scoped and must not be written to a hidden secondary memory store. When consented Session Outcome Memory exists, the same exact approval may be recorded in the Cognitive Ledger and linked to subsequent execution evidence.

## Cognitive Ledger

Durable judgment history is represented by bounded Cognitive Ledger events, not raw conversation transcripts.

Canonical event types are:

- `decision`
- `rejection`
- `correction`
- `approval`
- `evidence`
- `artifact_version`
- `outcome_transition`

A ledger entry can include statement, rationale, actor, source turn, timestamp, reference, superseded reference, and confidence.

Rules:

1. Normal Outcome State saves preserve existing server ledger history and deterministically derive new ledger events from trusted state transitions.
2. Goal changes, new decisions, rejected assumptions, artifact versions, artifact verification, confirmed definition-of-done criteria, and achieved outcomes leave durable traces.
3. Explicit `decision`, `rejection`, `correction`, and `approval` events use an authenticated append path; the server stamps human authorship rather than trusting arbitrary client JSON.
4. Corrections may supersede older entries without deleting history.
5. The Project Outcome Graph merges bounded ledger history across project sessions so a new chat can resume the same mission.
6. Only authoritative ledger history is injected into provider context.
7. Assistant-produced compact continuity is treated as inferred until confirmed by trusted state or the user; a direct user answer to a material question may be promoted to confirmed session context.
8. Synthetic worker/model subcalls do not receive durable Session Outcome identity and cannot author PCL memory.

## Execution authorization

Prompt instructions are not an execution boundary. Every executable side-effect adapter must enforce PCL authorization before performing consequential work.

A concrete action receives a stable `actionRef` derived from its scope, tool, consequence, description, and consequence-bearing arguments or content fingerprint.

Execution rules:

- safe/reversible + gate NONE → allow
- reversible/supervised + gate INFORM → allow and inform
- gate CHOOSE → block until the material choice is resolved
- gate APPROVE → require an active human `approval` matching the exact `actionRef`, either request-scoped confirmation or durable consented ledger approval
- successful execution → adapter returns provider evidence and records ledger `evidence` on the same `actionRef` when durable memory is consented
- existing matching durable evidence → block accidental replay of that exact side effect
- achieved outcome → do not manufacture additional execution

Approval for one recipient, amount, environment, content fingerprint, domain, or tool argument must not authorize a different action.

## Canonical response behavior

The user-visible response is composed only after the PCL decision and available tool results are considered.

The PCL should:

- answer or act directly when the path is safe and reversible
- avoid repeating facts already established by authoritative state
- surface only material assumptions
- repair a detected outcome gap before introducing new topics
- verify before claiming completion
- stop generating new work when the outcome is achieved
- offer at most one useful next move unless the user asks for a plan

## Adapter boundary

Adapters receive explicit requests such as ArtifactRequest or ToolRequest. They return a typed result such as ArtifactResult, ToolResult, EvidenceResult, or FailureResult.

An adapter must not:

- infer a new global intent from stale messages
- turn a refinement request into a blank new artifact
- write arbitrary cognitive history
- bypass the shared PCL execution gate
- treat model prose as human approval
- claim success without a verifiable provider result
- leak internal markers, control tags, hidden prompts, or implementation details

## Change control

Before merging a PCL-related change:

1. Add or update a golden transaction.
2. Run the full behavioral PCL test suite, not only typecheck.
3. Verify unrelated intents remain unrelated.
4. Verify authoritative state cannot be forged by ephemeral browser context.
5. Verify no new internal markers appear in user-visible text.
6. Verify memory reads and writes are explainable, bounded, consent-aware, and revocable.
7. Verify local model-experience telemetry cannot become PCL mission authority.
8. Verify adapters remain downstream consumers and the shared execution gate cannot be bypassed.
9. Verify high-risk actions require exact approval and successful actions require provider evidence.
10. Deploy to staging/preview before production.
11. Keep a rollback target for every production release.

## Protected north star

**PCL does not merely remember the conversation. PCL remembers the mission.**

A model may change. A chat may end. An artifact may evolve. The mission state, judgment history, evidence, and human governance remain coherent.
