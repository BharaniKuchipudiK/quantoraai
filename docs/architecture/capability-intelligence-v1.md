# Quantora Capability Intelligence v1

> **Status (2026-08): design only — not shipped.** The v1 module
> (`src/lib/capability-intelligence.js`) was removed as dead code: it was
> imported by nothing, and the live prompt surfaces render `capabilityProposals`
> through a different path. This document is preserved as the design of record;
> the proposer is to be implemented for real as part of Phase 3 (Cognitive
> Layer) / 8.1 (the Outcome Graph) in `ROADMAP.md`, not resurrected as-is.

## Decision

Quantora proposes a capability only when the current outcome state makes that
capability useful. Product or technology keywords, vendor logos and model names
are not activation criteria.

Capability Intelligence is the governed bridge between Outcome Navigator
(what should happen next) and an execution plane (what Quantora can safely do).

```text
Outcome State -> Next Conversation Move -> Capability Proposals
-> User/Policy Approval -> Execution -> Evidence -> Outcome State
```

## Capability contract

Every capability declares:

- stable provider-neutral identity;
- user value and applicable outcome stage;
- effect class: local state, durable memory, external read or external write;
- risk class;
- authentication, consent and confirmation requirements;
- evidence the capability must return after execution.

The registry is configuration and product policy. It contains no user-specific
secrets, brand matching, hidden prompts or hardcoded model responses.

## Proposal policy

Proposals are derived from trusted state such as:

- goal and definition of done;
- material open questions;
- Journey lifecycle;
- available artifacts and verification evidence;
- authentication and consent;
- current conversation move and risk;
- capability availability and health.

The first release deliberately supports only two native low-risk capabilities:

1. **Outcome Memory** when useful continuity exists, the user is signed in and
   durable memory has not been consented to.
2. **Journey tracking** when meaningful work exists but has no Journey outcome.

The rail is bounded to two quiet proposals, is dismissible per session and does
not transmit data merely by appearing.

## Execution governance

| Effect | Default policy |
| --- | --- |
| Local state | Direct, reversible action |
| Durable memory | Explicit consent |
| External read | Authenticated least-privilege access; disclose source |
| External write | Preview then confirm |
| High risk | Explicit confirmation plus verification |

No model may override this policy. Future connectors must return a typed
evidence envelope before Quantora advances an outcome or claims completion.

## User experience principles

- Offer capabilities, not integrations or logos.
- Explain the benefit in the label or accessible description.
- Never activate from a single ambiguous keyword.
- Never interrupt the conversation when the capability is optional.
- Suppress already active, dismissed or unusable capabilities.
- Keep machinery invisible; make control and evidence visible.

## Next increments

1. Extend Outcome State with explicit capability proposals and evidence.
2. Add server-side capability availability and authorization checks.
3. Introduce typed execution envelopes and idempotency keys.
4. Add read-only research/repository capabilities before external writes.
5. Add preview/approval UI for consequential writes.
6. Advance Journey from verified evidence rather than UI events alone.
7. Evaluate proposal acceptance, false activation, dismissal, completion and
   time-to-outcome before allowing learned ranking into production.
