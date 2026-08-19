# Quantora PCL Cognitive Kernel

Status: Phase 2 implementation on `feat/pcl-cognitive-kernel-v2`

## North star

**PCL does not merely remember the conversation. PCL remembers the mission.**

Quantora's canonical cognitive loop is:

**Understand → Judge → Act → Verify → Remember**

Models are replaceable generators. Adapters execute capabilities. PCL owns outcome continuity, judgment history, human governance, execution authorization and evidence.

## One brain, not two

There is one authoritative PCL memory path:

1. Session Outcome State — the most specific current-session outcome and consented continuity.
2. Project Outcome Graph — cross-chat project continuity assembled from trusted project/session state.
3. Cognitive Ledger — append-oriented judgment history for decisions, rejections, corrections, approvals, evidence, artifact versions and outcome transitions.

Ephemeral browser `SessionContext` is a fallback/hint, not durable authority.

The former local `usePCLMemory` model-health store is not PCL mission memory. It is now `useModelExperienceMemory`; the legacy hook is only a deprecated compatibility shim. Model failures, preference scores and recent negative-feedback snippets may influence failover/experience, but may not create mission facts, user approvals, decisions, rejections, corrections or evidence.

## Session PCL runtime

Normal user-facing chat carries a bounded `sessionId`, `projectId`, and `memoryConsented` flag to `/api/chat`.

Durable Session Outcome Memory is explicit and revocable:

- existing consent is honored;
- explicit user remember intent enables durable memory for that session;
- explicit forget/revoke intent disables consent immediately and requests deletion;
- without consent, no new durable Session Outcome State is written.

At stream completion, control markers are normalized once. Only compact continuity is projected into Outcome State:

- assistant-produced continuity is inferred;
- direct user answers to a material question may be confirmed;
- raw transcripts are not copied into the Cognitive Ledger;
- existing server ledger history is preserved and reconciled server-side.

Synthetic internal worker prompts, such as the Architect subcall used by the build swarm, deliberately receive no Session Outcome identity and therefore cannot author durable PCL memory.

## Project PCL

The server loads Project Outcome Graph context directly for signed-in project chat. Authority order is:

**Session Outcome State → Project Outcome Graph → ephemeral SessionContext**

A new chat can resume project goals, decisions, constraints, active rejections/corrections, artifacts, evidence and unfinished actions without turning old browser text into authority.

## Cognitive governance

The Outcome Navigator still selects the dialogue move. PCL adds consequence-aware governance:

- `NONE` — safe/reversible work proceeds autonomously;
- `INFORM` — medium-impact/reversible work proceeds under supervision;
- `CHOOSE` — one material ambiguity is resolved by the human;
- `APPROVE` — consequential, transactional, external or hard-to-reverse work waits for exact human approval.

Action intent and execution permission are separate. `Send`, `pay`, `delete`, `deploy`, etc. are recognized as action intent first; PCL then decides whether the side effect is permitted.

Examples:

- draft an email → autonomous internal work;
- send the email → external/hard-to-reverse → approve;
- deploy to staging/preview → medium/partial → inform;
- deploy to production → external/hard → approve;
- pay or delete production data → high/hard → approve.

## Cognitive Ledger

Ledger event types:

- `decision`
- `rejection`
- `correction`
- `approval`
- `evidence`
- `artifact_version`
- `outcome_transition`

Normal Outcome State saves cannot replace or erase prior server ledger history. Trusted state transitions deterministically derive new events for goal changes, decisions, rejected assumptions, artifact creation/verification, definition-of-done confirmation and achieved outcomes.

Explicit human decision/rejection/correction/approval events use an authenticated append path; the server stamps `actor=user`.

## Execution authorization

Prompt wording is not an execution boundary.

Executable external adapters use the shared `pcl-side-effect-guard` before contacting their provider. The guard derives a stable `actionRef` from the exact scope, tool, consequence and consequence-bearing arguments/content fingerprint.

Current integrations:

- Vercel production publish — exact human confirmation required;
- Vercel shareable preview — supervised/reversible, no production-style approval gate;
- GCP Cloud Run deploy — exact human confirmation required;
- Vercel custom-domain attachment — exact human confirmation required.

When consented Session Outcome Memory exists, matching approval and provider evidence are recorded against the same `actionRef`. Existing matching evidence blocks accidental replay. Without memory consent, a first-party confirmation may authorize only the current request and is not written to a hidden secondary store.

## Cost and provider model

PCL adds no additional LLM call per normal turn and no new model/provider dependency. Cognition, state projection, action classification and authorization checks are deterministic application logic around the existing provider call.

No second database is introduced. Existing Outcome State / Project persistence remains the authoritative durable store.

## Regression protection

The CI test runner explicitly executes the PCL TypeScript behavioral tests in addition to legacy tests. Protected Golden Transactions cover:

- safe autonomy;
- consequential approval;
- staging vs production;
- project isolation and cross-chat continuity;
- durable rejection/correction lineage;
- server-maintained ledger integrity;
- browser-context non-forgeability;
- explicit session-memory consent and revocation;
- synthetic-worker isolation;
- shared adapter execution authorization.

See `docs/pcl/PCL_CONSTITUTION.md` and `docs/pcl/GOLDEN_TRANSACTIONS.md` for the protected production contract.
