# PCL Constitution

Status: Protected baseline
Owner: Quantora platform
Scope: Proactive Communication Layer (PCL), cognitive memory, routing, anticipation, and response planning

## Purpose

The PCL is Quantora's protected intelligence layer. It maintains continuity across turns, understands the user's evolving goal, selects the next best conversational move, and coordinates downstream capabilities such as Canvas and Microsoft Office.

The PCL is not an adapter and not a presentation renderer. It is the platform's decision layer.

## Non-negotiable invariants

1. The current user turn outranks stale history when intent conflicts.
2. A downstream adapter may consume a PCL decision but may not rewrite cognitive memory or global routing rules.
3. Models may propose intent, memory, and actions; the PCL validates and decides.
4. No action may be claimed as completed without an execution result from the responsible adapter.
5. The assistant must not claim that Canvas, a side panel, or an artifact exists unless the current turn produced verified previewable content.
6. Memory is selective. Raw transcripts are not permanent memory.
7. Project memory, conversation memory, workspace state, and artifact metadata remain separate.
8. Proactive behavior must be useful, timely, reversible, and proportionate. When confidence is low, ask one focused question.
9. Office, Canvas, GitHub, search, and other integrations are isolated adapters behind explicit artifact or tool requests.
10. Every production change that touches routing, memory, context, or response planning must pass the golden transaction suite.

## Canonical turn contract

Each turn should resolve to a validated decision containing, at minimum:

- primary intent
- latent user goal
- active project or thread
- relevant memory reads
- unresolved questions
- confidence and uncertainty
- response mode
- next-best conversational move
- proactive offer, if any
- tool or artifact plan, if any
- proposed memory writes
- user-visible response

The user-visible response is composed only after the PCL decision and any tool results are verified.

## Memory rules

Every durable memory write must include:

- fact or preference
- source turn or artifact
- confidence
- created and last-confirmed timestamps
- expiry or review condition
- consent requirement, when applicable

Memory writes should be compact, evidence-backed, and easy to correct or delete.

## Adapter boundary

Adapters receive explicit requests such as ArtifactRequest or ToolRequest. They return a typed result such as ArtifactResult, ToolResult, or FailureResult.

An adapter must not:

- infer a new global intent from old messages
- turn a refinement request into a blank new artifact
- write directly to cognitive memory
- claim success without a verifiable result
- leak internal markers, control tags, or implementation details

## Proactive response policy

The PCL should look for:

- unfinished work
- repeated attempts
- frustration or confusion
- missing constraints
- a likely next step
- a useful artifact or clarification

It should offer at most one clear next move unless the user asks for a plan. Consequential actions require confirmation.

## Change control

Before merging a PCL-related change:

1. Add or update a golden transaction.
2. Verify unrelated intents remain unrelated.
3. Verify no new internal markers appear in user-visible text.
4. Verify memory reads and writes are explainable.
5. Verify adapters remain downstream consumers.
6. Deploy to staging before production.
7. Keep a rollback target for every production release.

## First protected baseline

The first baseline transaction is the weather sanity check in docs/pcl/GOLDEN_TRANSACTIONS.md. It must never produce an Office artifact or Canvas preview merely because an earlier conversation mentioned documents or code.
