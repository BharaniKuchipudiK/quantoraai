# Quantora Communication Layer

## Product thesis

Quantora is not a model picker and should not compete on access to free models.
Its product is a model-independent outcome system that helps a person move from
an incomplete request to a verified result with less repetition, lower risk,
and clearer control.

The Communication Layer owns six responsibilities that an underlying model
cannot reliably own by itself:

1. **Understand** — turn a request into an explicit goal, constraints,
   uncertainties, risks, and definition of done.
2. **Remember with consent** — maintain scoped, inspectable, correctable memory;
   never treat inferred or stale details as permanent truth.
3. **Anticipate** — identify the next best question or action from the current
   outcome state, without manufacturing urgency or repeatedly nudging.
4. **Govern** — apply identity, authorization, privacy, safety, cost, and tool
   policies before and after every model or tool call.
5. **Verify** — evaluate whether the response or artifact is safe, grounded,
   complete, and consistent with the user's definition of done.
6. **Learn** — improve policies from consented, privacy-safe outcome signals and
   controlled evaluations, not from hidden personality profiling.

Prompts, chips, and response formatting are delivery mechanisms. They are not
the moat. The defensible asset is the outcome graph, policy/evaluation system,
and accumulated evidence about which interventions help each class of task.

## Product promise

> Quantora keeps the goal, context, next step, and safety boundary coherent even
> when the underlying model changes.

The layer must never claim that it completed an external action unless a tool
returned verifiable evidence. It must express uncertainty when evidence is
missing and must ask for confirmation before consequential actions.

## Canonical outcome state

Conversation history is evidence, not application state. Each session should
maintain a versioned server-side outcome record:

```ts
type OutcomeState = {
  id: string;
  userId: string;
  version: number;
  goal: { statement: string; status: "draft" | "confirmed" | "achieved" };
  definitionOfDone: string[];
  constraints: Array<{ value: string; sourceTurn: string; confidence: number }>;
  assumptions: Array<{ value: string; status: "inferred" | "confirmed" | "rejected" }>;
  openQuestions: Array<{ question: string; material: boolean }>;
  decisions: Array<{ value: string; rationale?: string; sourceTurn: string }>;
  artifacts: Array<{ type: string; ref: string; verifiedAt?: string }>;
  nextActions: Array<{ action: string; risk: "low" | "medium" | "high" }>;
  safety: { policyVersion: string; unresolvedFlags: string[] };
  memory: { scope: "session" | "project" | "account"; consented: boolean };
  updatedAt: string;
};
```

Updates use optimistic concurrency (`version`) and retain provenance. A model
may propose a patch, but deterministic code validates and applies it. The model
must not write arbitrary memory markers directly into trusted state.

## Request lifecycle

```text
authenticate -> validate -> moderate input -> load outcome state
-> classify intent/risk -> choose next action -> select model/tools
-> execute within policy -> validate/moderate output -> verify outcome gap
-> persist state and evidence -> stream user-safe response -> measure outcome
```

Every stage emits a correlation ID and structured, privacy-safe operational
event. Raw prompts and personal data are excluded from analytics by default.

## Safety contract

Safety is contextual and layered. A single profanity regular expression is not
a safety system.

- **Input policy:** abuse, harassment, hate, self-harm, sexual content, child
  sexual exploitation, violence, wrongdoing, privacy abuse, malware, prompt
  injection, and attempts to misuse tools.
- **Tool policy:** allowlist tools per intent; enforce user and resource
  authorization; require confirmation for publishing, payment, messaging,
  deletion, account changes, or disclosure of private information.
- **Output policy:** scan generated text and artifacts; validate URLs, code,
  secrets, claims, and age-sensitive material before display or execution.
- **Response policy:** allow legitimate educational, preventive, reporting, and
  support contexts; refuse only the unsafe assistance; offer safe alternatives.
- **Severe content:** never generate, transform, locate, or distribute child
  sexual abuse material. Minimize retention and follow a legally reviewed
  escalation/reporting procedure for the jurisdictions where Quantora operates.
- **Humanity:** do not diagnose, shame, threaten, or pretend certainty. In
  distress scenarios, respond calmly and route to appropriate immediate help.

Policies are versioned configuration with an evaluation corpus. Production
behavior must not depend on hidden fixed responses or test-only branches.

## Model independence

Models implement a capability contract rather than leaking provider details
through product logic:

```ts
type ModelCapability =
  | "reasoning" | "vision" | "coding" | "tool_use"
  | "structured_output" | "long_context";

type ModelRequest = {
  taskClass: string;
  requiredCapabilities: ModelCapability[];
  maxCost: number;
  latencyClass: "interactive" | "deliberate";
  safetyTier: "standard" | "sensitive" | "high_risk";
};
```

The router selects only qualified, healthy models from a registry. Model names,
fallbacks, and availability are configuration/data, not hardcoded product
truth. Provider failure cannot bypass safety or authorization.

## Evaluation and moat

The Communication Layer is successful only when it improves outcomes. Measure:

- goal-confirmation accuracy;
- repeated-question rate;
- useful proactive-action acceptance rate;
- unsafe input/output escape rate;
- unsupported-claim and false-action rate;
- artifact validity and task completion;
- time and turns to verified outcome;
- correction rate and user-controlled memory deletion;
- cost and latency per completed outcome, not per message.

Maintain offline golden scenarios, adversarial safety scenarios, model-change
regression tests, and online experiments with explicit guardrails. Test fixtures
may be deterministic, but must remain isolated from runtime code and analytics.

## Delivery sequence

1. **Trust foundation:** protect paid/privileged endpoints, resource ownership,
   centralized validation/rate limits, type-safe builds, CI, audit events.
2. **Outcome State v1:** server-side session goal, constraints, decisions,
   provenance, consent, inspection, correction, and deletion.
3. **Orchestrator v1:** intent/risk classification, next-best-action policy,
   capability router, confirmation gates, and tool evidence.
4. **Safety Gateway v1:** versioned input/output/tool policies and evaluation
   corpus, with specialist legal and trust-and-safety review.
5. **Outcome Verifier v1:** task-specific completion checks and honest recovery.
6. **Learning loop:** privacy-safe outcome telemetry, experiments, and policy
   optimization across models and domains.

The current client-side session context and regex gap detectors may remain as
UI aids during migration, but they are untrusted hints—not the source of truth.

## Implemented vertical slice

Outcome Navigator v1 now provides the first server-side orchestrator slice:

- canonical provider-neutral conversation snapshots;
- authoritative Outcome State precedence over browser context;
- an explicit next-best-conversation-move taxonomy and explainable policy;
- a shared model contract across Gemini and OpenRouter;
- post-generation verification metadata;
- a policy evaluation corpus executed in CI.

See [Outcome Navigator v1](./outcome-navigator-v1.md) for contracts, current
limitations and the next delivery increments.
