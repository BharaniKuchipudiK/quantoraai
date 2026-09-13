# QIR server execution acceptance checklist

Updated 2026-09-13 against main #716 and pilot #717. This is release-oriented:
helper tests, a deployed worker and a complete customer journey are different
claims. See [the current closeout](RELIABILITY_CLOSEOUT_2026-09-13.md) for evidence
and priorities. Unchecked items can contain implemented mechanisms; the complete
acceptance criterion still needs proof.

## Established implementation and limited live evidence

- [x] Real Coding executor and production journal operate in the isolated Vercel Workflow pilot.
- [x] Lease/heartbeat and candidate checkpoint mechanisms exist; the live journal proof completed and reused its durable candidate.
- [x] Provider failure contracts retain structured status evidence; 402 is not automatically called an account-balance problem. Fixture coverage is not a real provider-outage proof.
- [x] Atomic checkpoint compare-and-swap rejects concurrent stale saves; the live conflict proof had one winner and one refusal.
- [x] Synthetic Workflow 503/process-exit recovery has preserved evidence, separate from the real browser journey.
- [x] Vercel Workflow deployment/configuration is documented in `services/qir-workflow/README.md`. Railway remains an optional alternative.
- [x] The one-account browser pilot submits and observes, with fixture browser gates proving no browser model fallback after admission or uncertain scheduling.

## Release gates still open

- [ ] Real authenticated browser admission, close/reopen, completed saved results and no browser-driven execution.
- [ ] Real customer Run survives a worker crash/reclaim and resumes the same action without duplicate external effects.
- [ ] Pause/resume/cancel operate against server-owned state through the deployed UI, including remote Sandbox shutdown.
- [ ] Exhausted initialization retries before journal creation become visible/recoverable to the user; scheduling acceptance alone cannot remain the final status.
- [ ] General submission identity supports transport retries and deliberate identical follow-up requests; the pinned single-run pilot is not the general solution.
- [ ] End-to-end provider 401/402/403/429/5xx, timeout and fallback coverage on the deployed submission path.
- [ ] GitHub capability facts, checkout/edit/push/PR, read-only refusal and mutation crash reconciliation are proved as complete authorized journeys.
- [ ] Failed verification, bounded repair, Preview behavior and source-revision-bound completion are proved together.
- [ ] Real deployment verification is driven end to end; a mocked `/api/deploy` response is insufficient.
- [ ] Repeated stability soak is green with recorded spend, recovery timing and zero lost edits.
- [ ] General customer activation replaces the compatibility browser path only after those gates pass.

## After the coding release

- [ ] Generalize the proven QIR execution spine to other domains without replacing working domain capabilities.
- [ ] Complete the original QIR multi-capability recovery proof and remaining phase acceptance criteria.

Do not close a broad item by substituting the smaller synthetic fixture proof
listed above. Add the concrete run/deployment/evidence reference when it passes.
