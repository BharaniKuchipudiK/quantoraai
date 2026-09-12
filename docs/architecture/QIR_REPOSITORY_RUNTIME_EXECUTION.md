# QIR repository runtime execution

PR #711 closes the gap between source inspection and real execution for server-owned Coding Runs.

## Execution order

1. Load the durable Coding Desk workspace.
2. Ask the server model for a concrete candidate workspace.
3. Persist that candidate as a durable desk checkpoint.
4. Write the exact candidate VFS into an isolated Vercel Sandbox microVM.
5. Derive bounded package checks from the candidate (`install`, `typecheck`, `test`, `build` when declared).
6. Run those commands in order and stop at the first non-zero exit.
7. Only after real repository execution passes does the existing semantic build verifier run.
8. Promotion to `COMPLETE` requires the applicable runtime checks and the semantic verifier to pass.

## Failure semantics

- Test command failure becomes `RUNTIME_FAILURE`.
- Typecheck/build failure becomes `COMPILE_FAILURE`.
- Unsafe or oversized candidate workspaces become `ARTIFACT_INVALID`.
- Those failures enter the verifier-guided repair loop introduced in #710, including the failing command and bounded output.
- If executable checks are declared but Sandbox execution is unavailable, the Run fails closed rather than claiming verification that did not happen.
- Workspaces with no supported executable package checks may continue to the semantic verifier; the runtime result is explicitly recorded as skipped.

## Safety and bounds

Candidate paths reject absolute paths and traversal. Generated/build directories are excluded. File count, per-file bytes, total bytes, output size, command count and command wall-clock are bounded. The Sandbox is destroyed in `finally`, on success or failure.

This runtime is an isolated cloud microVM. It is not the user's computer and it does not push, merge or deploy anything.
