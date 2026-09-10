# Coding fallback investigation — 10 September 2026

## Evidence and scope

Read-only investigation of the failed deployed test behind PR #683. Baseline
main: `e19bd1effec044acd8a5df258d546fc4c0263de5`, retaining #685's paid automation
pause. No provider generation, paid rerun, credential, budget, database or
production configuration change was requested during this investigation.

Original workflow: `34450906258`, job `102786185949`, head
`afc8858fd0302fd3e9d122eaef2ca194fe0aafd0`.
Request correlation: `studio-67d2770d-fef4-46c1-ab8e-66b5768c7f37`.
The following times are UTC, from the existing `transaction_boundary_events`
records; asynchronous recording can change the order of closely spaced events.

| Time | Recorded event |
| --- | --- |
| 07:38:28.782 | Calculator `/api/chat` started. |
| 07:38:29.709 | Gemini failed, HTTP 429, `quota-exhausted`. |
| 07:39:17.596 | OpenRouter Opus output failed `calculator-interaction-missing`. |
| 07:39:18.348 | Another Opus build attempt started. |
| 07:40:16.042 | That output failed `golden-vfs-shape-missing`. |
| 07:40:16.940 | A different OpenRouter model attempt started. |
| 07:40:30.114 | That output also failed `golden-vfs-shape-missing`. |
| 07:40:31.150 | A Sonnet fallback attempt started. |
| 07:41:10.984 | The existing browser log reported its 150-second preview timeout. |
| 07:41:13.214 | The server recorded `/api/chat` success on Sonnet. |

The server therefore did receive the request and did exercise fallback. A
separate project HTTP 409 was observed, but it did not prevent the above
request chain from reaching the models. Server success after the browser's
timeout is NOT proof that the browser ever displayed or saved a working result.
The rejected response bodies were not available in this investigation, so the
initial calculator rejection is not labelled a correct or false-positive check.

## Confirmed instruction contradiction

The test requested a React/Vite multi-file project and explicitly disallowed
`index.html`. `useChatStream` appends `retryBrief` to that original request.
The new-project branch of `buildContractRetryBrief` unconditionally demanded
exactly one self-contained HTML document and prohibited native source. That
instruction was also carried into later artifact escalations. The server's
calculator contract requires named VFS files and rejects standalone HTML.
These instructions cannot both be satisfied; this is independently reproducible
without another model call. It is a confirmed recovery defect, not proof that
it accounts for every failed provider response in the recorded run.

## Narrow correction

Preserve the original language, runtime, framework, filenames and layout in
new-project repair instructions. Keep complete single-file HTML as the fallback
only for a web-page request without an explicit framework or file layout.
Do not announce a self-contained-page rewrite for every new-project repair.
Existing-project patch instructions, sandbox restrictions, retry decisions,
engine selection, budgets, completion rules and all server validators remain
unchanged. No new execution or completion system is introduced.

## Verification boundary

The focused instruction-contract tests fail on the baseline and pass with the
patch. Additional repository tests exercise the real hook recovery closure,
the actual request-payload expression and the existing server artifact validator
using deterministic fixtures. They do not claim that a real model obeyed the
corrected instructions, or that a fixture was the historic rejected response.
Full repository CI and deployment checks must be recorded against the candidate.
Live model generation remains NOT RUN under the spending pause; this change
is a draft until the release evidence and spending decision permit otherwise.

## Remaining work

- Reconcile browser and server deadline reporting without merely extending a
  timeout or increasing attempts.
- Complete the Python-only generation/verification path; this prompt correction
  does not add Python execution or remove the current browser-only requirement.
- Preserve latest local edits through genuine save conflicts and prove readback.
- Enforce and reconcile per-operation financial allowances across providers.
- Keep requested-file representation PR #683 separate; do not claim its old
  deployed failure has become a passing test because the diagnosis improved.
