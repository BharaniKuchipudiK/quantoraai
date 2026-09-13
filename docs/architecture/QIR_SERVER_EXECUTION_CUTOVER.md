# QIR server execution cutover

> **Current status (2026-09-13):** This document includes historical implementation
> status. Use [Reliability closeout](RELIABILITY_CLOSEOUT_2026-09-13.md) for current
> evidence, open release gates and the ordered backlog. QIR is not yet complete
> as a production-wide runtime.

This document freezes the agreed execution-spine plan so stabilization work cannot silently replace or regress the original roadmap.

## Destination architecture

Browser/UI -> durable QIR Run -> standalone server worker -> real model/tools/verifier -> durable observation/checkpoint/result.

The browser is a controller/view only. Closing or refreshing it must not stop a Run. A worker crash may lose an in-flight external attempt, but durable ownership, idempotency, and recovery must prevent duplicate side effects and allow another worker to continue.

## Already complete

- Durable QIR contracts, journal, checkpoints, recovery, pause/resume/cancel and workflow adapter boundary.
- Production Supabase Run-store adapter (#705).
- Durable worker lease, heartbeat, safe reclaim and two-worker contention/crash proof (#706).
- GitHub repository checkout/runtime source context and authenticated commit/PR path (#707).

## PR 708 — server execution cutover

This PR must not be called complete until all of the following are true:

1. Replace the heartbeat-only worker executor with the real Coding execution path used for model/tool work.
2. Keep provider/model/tool execution behind server-owned code; do not proxy the browser's `/api/chat` turn as the worker implementation.
3. Persist structured provider failure facts (provider, model, HTTP status, provider code/message, retryability, route/fallback) without inventing diagnoses from status alone.
4. Add external-action idempotency so a crash after a side effect but before durable completion cannot blindly repeat GitHub/tool/provider mutations.
5. Add a crash-after-side-effect proof in CI.
6. Run against the production Supabase store under the existing durable lease/heartbeat ownership contract.
7. Provide a production worker start command/config suitable for the long-running Railway/container process.
8. Preserve the existing browser-driven path behind a compatibility switch until PR 709 performs the ownership cutover.

## PR 709 — browser ownership cutover and reliability gate

This PR must not be called complete until all of the following are true:

1. Coding Desk submits/observes/controls a durable Run instead of driving model/tool steps itself.
2. Browser close, refresh or reconnect does not stop server execution.
3. Pause/resume/cancel operate against the server-owned Run.
4. Runtime capability facts are authoritative: GitHub connected/read-only/can-push/can-open-PR, preview/execution availability and provider state are passed as data; generated prose may not contradict them.
5. End-to-end gates cover provider 401/402/403/429/5xx, timeout, fallback, worker crash/reclaim, browser loss, preview failure/recovery, GitHub checkout/edit/push/PR and read-only refusal.
6. A repeated stability/soak gate runs representative Coding journeys and fails release on recurring nondeterministic failure classes.

## Remaining original roadmap after 709

Once the Coding path is proven server-owned and stable, generalize the same QIR execution spine to the other Quantora domains/workspaces. Do not generalize before the Coding path has passed the reliability gate.

## Non-regression rule

A green component test is not sufficient evidence for a user journey. Every capability claimed by the product must have a release gate that reaches it from the user's entry path, and every failure message must be derived from structured runtime evidence rather than guessed from an HTTP status or model prose.
