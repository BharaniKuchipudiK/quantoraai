# QIR browser ownership cutover — PR #709

> **Current status (2026-09-13):** This document includes historical implementation
> status. Use [Reliability closeout](RELIABILITY_CLOSEOUT_2026-09-13.md) for current
> evidence, open release gates and the ordered backlog. QIR is not yet complete
> as a production-wide runtime.

## Destination

Coding Desk becomes a controller/view over a durable server-owned Run:

Browser/UI -> durable QIR Run -> standalone worker -> model/tools/runtime/verifier -> durable observation/checkpoint/result -> browser observer.

Closing or refreshing the browser must not stop execution. A worker restart may interrupt one in-flight attempt, but lease ownership plus idempotency must let another worker reclaim the same Run safely.

## Cutover order

1. Bind the durable Run to the current Coding Desk session and workspace before execution is made runnable.
2. Submit one durable `coding.model` step. The browser must not call `/api/chat` to execute that Coding step once server ownership is selected.
3. Let the standalone worker own model execution, workspace mutation, verification and repair.
4. Poll/observe durable Run state from the browser. Pause/resume/cancel remain durable server transitions.
5. Reload the verified desk checkpoint produced by the worker instead of accepting model bytes directly from a browser response.
6. Prove browser loss, worker crash/reclaim, verification failure/repair and provider failure/fallback in release gates.
7. Prove repository checkout -> inspect -> edit -> execute -> verify -> commit -> push -> PR against a real external repository.

## Compatibility boundary

The historical browser-driven Coding path may remain only as an explicit compatibility mode while #709 is being validated. Server ownership must never silently fall back to browser execution after a server-owned Run has been submitted; that would create two possible execution owners for the same action.

## Completion rules

#709 is not complete until:

- the browser can submit and observe a Run without driving its execution steps;
- closing/reopening the browser does not stop the Run;
- generated changes are verified by real execution/build/test evidence before completion;
- a failed verification produces another durable repair action rather than a completion claim;
- provider/tool failures remain structured evidence and recovery decisions are deterministic;
- Git delivery exposes coherent branch, commit, push and PR state;
- an external-repository production journey passes end to end;
- repeated stability runs do not reveal recurring nondeterministic failure classes.
