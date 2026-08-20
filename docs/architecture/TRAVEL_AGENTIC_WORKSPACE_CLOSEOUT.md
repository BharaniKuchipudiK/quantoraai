# Travel Agentic Workspace closeout

Travel remains a capability of the Quantora Personal Agentic AI platform, not a separate orchestration stack.

## Conversation leadership

PCL owns whether a turn should answer-and-advance, resolve one blocker, seek approval, or close. Travel receives an optional one-question budget after useful value is delivered. A question becomes required only for a material blocker, conflict, or approval gate.

The model owns natural wording; PCL owns the policy. Known facts must not be re-asked. Questionnaires and checklist-style intake are prohibited.

## Domain continuity

Explicit `studioDomain` is authoritative. If a client omits it, the server may infer a domain only from configured domain signals in the current/recent conversation and only when one domain clearly outranks the others. Ambiguous input stays general.

The existing client specialist-domain bridge remains as compatibility/fail-safe redundancy; server-side normalization no longer depends on that bridge for clear Travel continuity.

## Safety

This closeout adds no booking autonomy, new provider, credential, database schema, or side effect. Existing Duffel/Google provider validation, resilience, PCL approval/evidence gates, and Travel browser release gate remain authoritative.
