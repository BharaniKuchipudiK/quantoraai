# PCL Agent Execution Fabric

Status: Foundation / provider-neutral runtime contract

## Purpose

Quantora must be able to delegate complex work to specialist agents without making PCL dependent on one model vendor or one agent SDK.

PCL remains the control plane. External agent frameworks are execution runtimes underneath it.

```text
User outcome
   ↓
Outcome Navigator + PCL Cognitive Kernel
   ↓
PCL Agent Execution Plan
   ↓
PCL approval / choice / side-effect gates
   ↓
Agent Runtime Registry
   ├─ Quantora native runtime
   ├─ OpenAI Agents SDK adapter
   ├─ Claude Agent SDK adapter
   ├─ Google ADK / A2A adapter
   └─ future/custom runtimes
   ↓
Tools / MCP / provider APIs / sandbox
   ↓
Independent verification
   ↓
Evidence + Outcome State
```

## Non-negotiable architecture rules

1. **PCL owns the outcome.** A worker receives a bounded task; it does not replace the user goal, Outcome Contract or Cognitive Ledger.
2. **Plans are provider-neutral.** A plan asks for capabilities such as research, analysis, coding, artifact generation, travel intelligence, tool execution and verification. It never hard-codes Claude, Gemini, OpenAI or another vendor.
3. **Runtimes are replaceable adapters.** The registry resolves a task to any healthy adapter that satisfies the declared capabilities. Runtime priority is policy, not architecture.
4. **Consequential actions cannot bypass PCL.** External, transactional and destructive tasks must require explicit approval and provider evidence.
5. **Fallback is first-class.** If the preferred runtime fails, the fabric can try another compatible runtime without rewriting the plan or weakening governance.
6. **Verification is independent.** Multi-step work, artifact creation, code changes and side effects require a verifier before Quantora claims completion.
7. **No fake completion.** Builders/executors that require evidence must return an evidence reference. A verifier must explicitly pass.
8. **No second memory system.** Agent runtimes receive bounded context from PCL and return results/evidence to the existing Quantora state model.

## V1 specialist roles

| Role | Responsibility | Typical capabilities |
| --- | --- | --- |
| Researcher | Gather authoritative evidence or provider-backed facts | research, travel_intelligence |
| Analyst | Synthesize evidence, compare options, make recommendations | analysis |
| Builder | Produce code or professional artifacts | coding, artifact_generation |
| Executor | Perform an explicitly authorized tool/side-effect action | tool_execution |
| Verifier | Independently check proof of done | verification |

V1 deliberately uses a deterministic pipeline. Parallel fan-out can be added after observability and evidence semantics are proven.

## Runtime adapter contract

Every runtime adapter declares:

- a stable adapter id;
- runtime kind;
- priority;
- capabilities;
- optional health/availability check;
- an execute function returning success/failure, output, evidence and verification metadata.

This lets Quantora integrate agent frameworks without allowing their orchestration semantics to become the platform architecture.

### Planned adapters

**Quantora native** — baseline implementation for deterministic tools and current agent loops.

**OpenAI Agents SDK** — candidate for TypeScript agent loops, handoffs/agents-as-tools, sessions, MCP, sandbox execution and tracing.

**Claude Agent SDK** — optional premium worker for repository/code and other tasks where its agent harness is demonstrably superior.

**Google ADK / A2A** — candidate for distributed specialist agents and cross-agent interoperability. A2A should complement MCP: A2A connects agents to agents; MCP connects agents to tools/context.

No external SDK is a required dependency of PCL.

## PCL governance behavior

- `ready`: autonomous reversible work can execute.
- `supervised`: reversible/medium-impact work can execute while keeping the user informed.
- `requires_approval`: preparatory reasoning may proceed, but the consequential task pauses until the existing PCL approval boundary is satisfied.
- `requires_choice`: do not delegate because the material user decision is unresolved.
- `blocked`: do not execute (for example, outcome already complete).

The existing `pcl-execution-gate.ts` and `pcl-side-effect-guard.ts` remain authoritative for real side effects. The Agent Fabric does not invent a competing approval system.

## Verification contract

A run is complete only when:

1. all dependencies completed successfully;
2. required evidence references exist;
3. a verifier task, when present, explicitly returns `verification.passed = true`;
4. no PCL approval/choice gate remains unresolved.

This provides a common Proof-of-Done seam across model vendors and agent SDKs.

## Rollout

### Phase 1 — foundation (this change)
- provider-neutral execution plan;
- runtime registry and fallback;
- PCL approval/evidence semantics;
- deterministic verifier contract;
- regression tests;
- observability metadata only; no production worker activation.

### Phase 2 — Quantora native pilot
Activate the fabric for one low-risk workflow, likely research → analysis → verification, using existing Quantora model/tool infrastructure.

### Phase 3 — external runtime adapter pilot
Add one SDK behind the adapter boundary (recommended first candidate: OpenAI Agents SDK for TypeScript) and benchmark it against the native worker.

### Phase 4 — heterogeneous workers
Add Claude Agent SDK and Google ADK/A2A only where benchmarks show meaningful value. Runtime routing considers capability, health, quality, latency and cost.

### Phase 5 — durable multi-agent outcomes
Allow longer-running/deferred specialist work only after durable execution state, resumability, cancellation, idempotency, user-visible progress and evidence persistence are fully defined.

## What this deliberately does not do

- It does not activate autonomous external actions.
- It does not add any provider key.
- It does not install an external agent SDK.
- It does not replace the current chat loop.
- It does not change Travel or Office generation.
- It does not create a second hidden memory store.

The goal of V1 is to make future agent capability **pluggable without making Quantora fragile or vendor-dependent**.
