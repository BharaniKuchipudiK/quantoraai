# Quantora Production Release Standard

A green build is not a release. A release is acceptable only when the user journey is proven.

## Definition of done

Every customer-facing change must pass all applicable gates before merge to `main`.

### Gate 1 — Static quality
- TypeScript/typecheck passes.
- Frontend undefined-variable lint passes.
- Unit and contract tests pass.
- Production build completes.
- High/critical dependency audit passes or has an explicit documented unreachable-risk exception.

### Gate 2 — Browser journey
For every changed customer journey, a headless Chromium test must exercise the real rendered UI rather than only helper functions.

For Travel, the mandatory journey currently verifies:
1. restore a signed-in synthetic user;
2. enter Studio;
3. click Travel Advisor;
4. Travel welcome is visible even when the generic welcome preference is hidden;
5. global Studio/Journey/Quantum and internal model plumbing do not leak into Travel;
6. a user request completes inside the response SLA;
7. the next-step decision card renders;
8. after selection the card collapses to compact question + chosen answer history;
9. the advisor proactively advances to the next material question.

A screenshot is retained as CI evidence on success or failure.

### Gate 3 — Failure-state behaviour
No customer turn may remain indefinitely in an executing/thinking state.

- Every upstream request has a timeout.
- Provider failure must terminate with a visible, actionable result.
- Streaming code must never attempt to change response type after headers have been sent.
- Failed provider calls must never be represented as successful outcomes.

### Gate 4 — Provider contract tests
External providers are behind provider-neutral contracts.

Before enabling or changing a live provider path:
- validate required input fields before the provider call;
- reject stale or past travel dates;
- verify provider timeout/error mapping;
- verify no booking/side effect occurs without explicit approval;
- run a non-destructive sandbox/canary call where provider credentials allow it.

### Gate 5 — Preview canary
A customer-facing PR is not merge-ready merely because Vercel says `READY`.

The exact PR head must pass its browser release journey against the code that will be merged. Provider-dependent changes additionally require a Preview canary using the intended Preview secrets/environment.

### Gate 6 — Production smoke
After merge:
- confirm the production deployment SHA equals the merge SHA;
- confirm `quantoraai.app` points to that deployment;
- run the critical smoke journey;
- inspect production runtime errors for the release window.

If the smoke journey fails, the release is treated as defective immediately. Fix-forward or rollback; do not explain the failure as an acceptable transient state.

## No-merge rules

Do not merge when any of the following are true:
- the visible UX was not exercised;
- the PR changes a customer journey but has no browser coverage for the changed behaviour;
- a live provider call depends on hallucinated/inferred required fields;
- an external side effect is not approval/idempotency/evidence protected;
- a spinner/executing state has no bounded termination path;
- CI is green only because the relevant test is optional or unauthenticated;
- Preview is `READY` but the user journey has not been run.

## Synthetic transaction policy

Synthetic tests are first-class product monitoring, not optional diagnostics.

We distinguish:
1. **Deterministic browser synthetic** — mocked upstreams, mandatory on every PR. Proves UI/state/conversation orchestration.
2. **Provider sandbox synthetic** — real non-destructive Duffel/Google calls with test credentials where supported. Mandatory before enabling provider-path changes.
3. **Production smoke synthetic** — authenticated low-risk journey after deployment. Must never book, purchase, modify calendars, or create external side effects.

The goal is simple: failures should be found by Quantora's release system before a user finds them.
