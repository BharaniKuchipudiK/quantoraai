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
7. Project Outcome Graph, session Outcome State, ephemeral browser context, workspace state, and artifact metadata remain distinct sources with explicit authority.
8. Authoritative continuity follows this precedence for current work: **session Outcome State → Project Outcome Graph → ephemeral SessionContext**. Project context may enrich a session but may not overwrite a more specific session decision.
9. Browser-supplied ephemeral context may help the current turn but may not manufacture durable decisions, approvals, rejections, corrections, or evidence.
10. The Cognitive Ledger is append-oriented judgment history. A normal Outcome State replacement may not silently erase prior cognitive history.
11. Active corrections and rejections remain first-class context. A rejected direction must not be casually resurrected unless the user explicitly reopens it.
12. Proactive behavior must be useful, timely, reversible, and proportionate. When a genuinely material choice is missing, ask exactly one focused question.
13. Office, Studio/preview, GitHub, search, and other integrations are isolated adapters behind explicit artifact or tool requests.
14. Every production change that touches routing, memory, context, cognition, human governance, or response planning must pass the golden transaction suite.

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

## Execution authorization

Prompt instructions are not an execution boundary. Every side-effect adapter should enforce PCL authorization before performing consequential work.

A concrete action receives a stable `actionRef` derived from its scope, tool, consequence, description, and arguments.

Execution rules:

- safe/reversible + gate NONE → allow
- reversible/supervised + gate INFORM → allow and inform
- gate CHOOSE → block until the material choice is resolved
- gate APPROVE → require an active human `approval` ledger event matching the exact `actionRef`
- successful execution → adapter records `evidence` on the same `actionRef`
- existing matching evidence → block accidental replay of that exact side effect
- achieved outcome → do not manufacture additional execution

Approval for one recipient, amount, environment, or tool argument must not authorize a different action.

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
- bypass a required PCL execution gate
- claim success without a verifiable result
- leak internal markers, control tags, hidden prompts, or implementation details

## Change control

Before merging a PCL-related change:

1. Add or update a golden transaction.
2. Run the full behavioral PCL test suite, not only typecheck.
3. Verify unrelated intents remain unrelated.
4. Verify authoritative state cannot be forged by ephemeral browser context.
5. Verify no new internal markers appear in user-visible text.
6. Verify memory reads and writes are explainable and bounded.
7. Verify adapters remain downstream consumers and execution gates cannot be bypassed.
8. Verify high-risk actions require exact approval and successful actions require evidence.
9. Deploy to staging/preview before production.
10. Keep a rollback target for every production release.

## Protected north star

**PCL does not merely remember the conversation. PCL remembers the mission.**

A model may change. A chat may end. An artifact may evolve. The mission state, judgment history, evidence, and human governance remain coherent.