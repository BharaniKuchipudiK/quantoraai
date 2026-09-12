# Coding stabilization after #712

## Implemented locally

- A different goal submitted after COMPLETE or FAILED_TERMINAL creates a new Run bound to the same desk session. An active or paused different goal reports a conflict instead of silently returning the wrong Run. Repeating the current goal reuses its Run.
- Existing package.json typecheck/test/build commands cannot be removed or changed by a generated candidate before saving it. This prevents the candidate from discarding those checks before execution.
- Worker ownership cancellation propagates to sandbox verification: it requests sandbox shutdown and prevents further verification commands or a successful result after cancellation.
- The Coding executor now also passes ownership cancellation to the model and checks ownership after every awaited pipeline stage. A late provider/verifier response cannot start the next stage or promote a completed Run after cancellation.
- Updated the attachment-summary contract test for the fourth completion path introduced by #712; that path already includes the summary.

## Limits

- Submission identity still uses goal equality. Explicit message IDs are needed to distinguish deliberate identical requests from retried transport submissions and to cover uncertain create responses across reloads.
- The verification guard is deliberately narrow: it does not protect the bodies of tests or their dependencies, nor does it authorize intentional edits to verification scripts. A durable, revision-bound outcome contract remains required.
- Neither fix activates server ownership in the browser. Production worker service identity, revision, heartbeat and job consumption must be verified first.
- Crash reconciliation, candidate isolation, spend accounting and production journey proof remain open in the audit. Cancellation tests use a mock sandbox; remote shutdown still needs live verification.
- Cancellation does not undo a workspace write already in flight. Atomic storage-level ownership fencing and revision checks are still required; the semantic verifier itself is not yet cancellable, though its late result is discarded.

## Regression evidence

Tests cover terminal follow-up creation, same-session binding, repeated submissions, active-task conflict, and attempts to remove, corrupt or replace required verification scripts. Provider and sandbox results in these tests are fixtures, not production execution evidence.

Ownership regression coverage aborts before execution and during workspace load, model generation, workspace save, runtime verification and semantic verification. Each case asserts that later stages do not run and no completed Run is returned.

## Next implementation order

1. Isolate failed candidates from the last verified workspace; add revision/ownership fencing to checkpoint writes and crash replay before another generation.
2. Wire browser submission/observation behind an explicit server-ownership switch, with no browser execution fallback for an accepted Run.
3. Verify worker deployment, heartbeat, job consumption and restart recovery before activating server ownership in production.
4. Exercise initial build, follow-up edit, browser disconnect, provider failure and failed-verification repair end to end. Only then expand external Git delivery and its action idempotency.
