# PR #710 — verifier-guided durable repair loop

## Goal

Close the first execution-spine gap after #709: a server-owned Coding Run must not merely detect a failed verification. The concrete verifier evidence must become input to the next durable repair attempt.

## Flow

1. Worker loads the latest durable Coding Desk workspace.
2. Model writes a candidate checkpoint.
3. Independent server verification evaluates that candidate.
4. On failure, the Run persists the verifier score, summary and concrete issues.
5. The next durable attempt loads the failed candidate and receives those failures as `REPAIR EVIDENCE`.
6. The model repairs the existing candidate rather than starting over.
7. Only a verified candidate is promoted to `COMPLETE`.
8. Repeated artifact/verification failures are bounded by `QIR_WORKER_MAX_REPAIR_ATTEMPTS` (default 3 repair attempts). Exhaustion becomes `FAILED_TERMINAL` rather than an infinite loop.

## Non-regression rules

- Provider/network failures do not consume the artifact-repair budget.
- Browser execution is not reintroduced; the server worker remains the single owner established by #709.
- A failed verifier result can never be promoted as complete.
- Repair attempts always operate on the latest durably saved failed candidate.

## Next after #710

Move from VFS/build verification toward real repository execution: checkout/worktree, command execution, tests/builds, captured evidence, and repair from command failures.
