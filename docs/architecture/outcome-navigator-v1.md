# Quantora Outcome Navigator v1

## Decision

Quantora owns the conversation strategy; the selected AI provider supplies
language and specialist capability. Conversation history remains evidence, not
the source of truth.

Outcome Navigator v1 inserts a provider-neutral policy decision into every
normal `/api/chat` request:

```text
authenticate -> validate -> moderate input -> load consented outcome state
-> build conversation snapshot -> choose next conversation move
-> format provider-neutral contract -> call selected provider
-> verify response -> return policy metadata -> measure outcome
```

This is a vertical slice, not a claim that the complete learning system already
exists. It establishes stable contracts that future domain packs, policy
experiments and learned ranking can use without changing provider integrations.

## Canonical contracts

### `ConversationSnapshot`

A bounded, normalized view of:

- goal and definition of done;
- confirmed facts versus inferred context;
- material open questions;
- decisions, artifacts and risk-labelled next actions;
- unresolved safety flags and recent listening signals;
- current mode, domain and request attributes;
- state authority and optimistic-concurrency version.

When a signed-in user has enabled consented Outcome State for the session, the
server record is authoritative and browser-supplied context cannot override it.
The client consent flag can suppress a read but can never create or modify
server memory. Without a server record, local context remains an explicitly
ephemeral hint so anonymous BYOK sessions retain continuity without silently
creating durable memory.

### `ConversationMove`

The initial model-neutral action space is:

| Move | Purpose |
| --- | --- |
| `answer` | Resolve a clear immediate question |
| `clarify` | Ask one materially consequential question |
| `recommend` | Make a decision-oriented recommendation |
| `challenge` | Surface risk or require consequential confirmation |
| `act` | Perform requested safe work now |
| `verify` | Check the result against evidence and definition of done |
| `recover` | Repair an unmet intent before advancing |
| `anticipate` | Offer one relevant next step after meeting the immediate need |
| `close` | Recognize completion without manufacturing more work |

The deterministic v1 policy scores candidates using explainable reason codes.
Only the winning move and its instruction enter the model contract; candidate
scores and internal reasoning are not exposed to the provider or user.

### `ConversationVerification`

The first verifier detects:

- empty responses;
- missing or excessive questions after a `clarify` decision;
- thin delivery after an `act` decision;
- claims of consequential external actions without tool evidence;
- unresolved link and price outcome gaps;
- severe unsafe output caught by the deterministic safety floor.

Because the existing endpoint streams provider tokens directly, v1 attaches the
verification result to the final stream event for measurement and regression.
It does not pretend it can retract already-streamed text. A later buffered gate
must be introduced before automatic output repair or blocking is enabled for
high-risk response classes.

## Provider contract

Gemini and OpenRouter receive the same compact directive after Quantora's common
conversation policy. The directive contains the selected move and only the
bounded state needed to execute it. Provider names, prompting quirks and
fallback behavior remain outside the policy engine.

Every final stream metadata event includes:

```json
{
  "conversation": {
    "policyVersion": "outcome-navigator-2026-08-13.1",
    "move": "act",
    "reasonCode": "explicit_action_request",
    "confidence": 0.8,
    "stateSource": "authoritative",
    "stateVersion": 4,
    "verification": {
      "status": "pass",
      "score": 1,
      "issues": []
    }
  }
}
```

The Studio stores this operational metadata with the assistant turn. It is not
shown as internal reasoning.

## Evaluation

`scripts/fixtures/outcome-navigator-scenarios.json` is the initial policy
corpus. It deliberately contains no runtime branches or canned user-facing
responses. `npm run test:outcome-navigator` replays it against the policy and is
part of CI through `test:all`.

The initial regression dimensions are:

- direct answer versus unnecessary question;
- material clarification versus explicit permission to assume;
- recommendation and verification intent;
- outcome-gap recovery;
- high-risk confirmation;
- useful low-risk anticipation;
- achieved-outcome closure;
- guided build intake;
- unresolved safety boundaries.

## Privacy and safety properties

- No raw prompts or response bodies are added to analytics.
- Durable state remains consent-gated and user-deletable.
- Confirmed server state outranks client context.
- Prompt-bound state is normalized, bounded and clearly delimited.
- Provider fallback cannot bypass the selected move or safety policy.
- Models propose language; deterministic code owns state authority and policy.

## Next increments

1. Persist privacy-safe move, reason, verification and outcome signals in a
   dedicated policy-event table.
2. Add tool-evidence envelopes and confirmation tokens for consequential acts.
3. Buffer high-risk response classes for output-policy enforcement before
   display; retain streaming for ordinary low-risk dialogue.
4. Replace HTML-comment state proposals with a validated `StatePatch` schema.
5. Add domain policy packs as data/configuration, not hardcoded response copy.
6. Run shadow policies and A/B evaluation against outcome metrics before any
   learned policy is allowed to select production moves.
7. Optimize for completed outcomes, repeated-question rate, correction rate,
   useful proactive-action acceptance, safety escape rate, latency and cost.
