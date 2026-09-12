# QIR server execution acceptance checklist

This checklist is intentionally release-oriented. A change is not accepted merely because an isolated helper has tests.

## PR 708 acceptance

- [ ] Real Coding executor runs from the standalone worker process.
- [ ] Worker uses the production Supabase Run store and durable lease/heartbeat.
- [ ] Provider/model/tool failures are recorded as structured evidence, including the provider's actual HTTP status/code/message.
- [ ] No 402 response is automatically rewritten as an account-balance diagnosis.
- [ ] External side effects have an idempotency key tied to Run/action/tool invocation.
- [ ] CI proves crash after external side effect and before durable completion does not duplicate the mutation.
- [ ] Production worker start command is documented and suitable for Railway/container deployment.
- [ ] Browser-driven execution remains available only as a compatibility path pending PR 709.

## PR 709 acceptance

- [ ] Browser starts and observes a durable Run; it does not drive execution steps.
- [ ] Browser refresh/close/reopen leaves execution alive.
- [ ] Worker crash/reclaim resumes the same Run.
- [ ] Pause/resume/cancel operate against server-owned state.
- [ ] GitHub capability facts prevent false claims such as “I cannot open a PR” when authenticated PR creation is available.
- [ ] End-to-end gates cover provider 401/402/403/429/5xx and timeout/fallback behavior.
- [ ] End-to-end gates cover GitHub checkout/edit/push/PR and read-only refusal.
- [ ] End-to-end gates cover Preview failure, recovery and verified completion.
- [ ] Repeated stability soak is green before release.

## After 709

- [ ] Generalize the proven QIR execution spine from Coding to the other Quantora domains/workspaces.
