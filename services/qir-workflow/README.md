# Coding Workflow pilot

An isolated, operator-only worker service. It reuses Quantora's QIR journal,
worker lease, candidate workspace, verifier and atomic checkpoint publication.
The main Vite/Express deployment and browser execution remain unchanged by default.

## Build and test

From the repository root:

- `npm run build:qir-workflow` builds the isolated Node service.
- `NITRO_PRESET=vercel npm run build:qir-workflow` produces
  `services/qir-workflow/.vercel/output` for a dedicated Vercel worker project.
- `npm run test:qir-workflow-recovery` builds a separate local-only fixture and
  proves simulated provider-503 recovery followed by SIGKILL and restart.
- `npm run lint`, `npm run test:all`, and `npm run build` check the main application.

The scripts deliberately change into the service directory before building.
Using Nitro's `--dir` from the repository root produced different workflow IDs
in the caller and registration bundles. A successful build alone did not expose
this; the execution proof caught it.

The local fixture externalizes `@workflow/world-local`: its startup/version
check needs its real package metadata. It calls the local world's startup hook
so pending runs are re-enqueued after process restart. This is a local-engine
proof, not proof of Vercel production recovery. Never deploy the fixture.

## Required operator configuration

All settings are server-side. Do not use `VITE_` variables for credentials.

| Variable | Purpose |
| --- | --- |
| `QIR_WORKFLOW_PILOT_ENABLED` | Must equal `true`; omit to disable. |
| `QIR_PILOT_USER_SUB` | One dedicated synthetic test user. |
| `QIR_PILOT_RUN_ID` | One durable test run owned by that user. |
| `QIR_AI_GATEWAY_API_KEY` | Dedicated Coding pilot key; $5 total budget, no automatic refresh, 30-day expiry. |
| `QIR_GATEWAY_MODELS` | Explicit comma-separated allowed model IDs. |
| `QIR_WORKER_MODEL` | One allowed provider/model ID, chosen from the actual eligible catalogue. |
| `ADMIN_API_KEY` | Dedicated isolated-worker admin bearer key, minimum 16 characters. |

Provide the existing server-side database settings required by the QIR store
and existing Sandbox configuration for runtime verification. Do not copy all
web-project secrets into the worker indiscriminately. Confirm the generated
Vercel function configuration, region and Linux-native dependencies on the
actual remote build before enabling the pilot.

Create a synthetic Coding Desk session and run through the existing persistence
APIs. Its working context must contain the session binding and explicitly set
`projectState.executionOwner` to `server`. Never bind a currently browser-executed
customer session. The pilot rejects runs without this marker.

`POST /runs` requires the admin bearer header. It accepts no user/run/model from
the caller: only the pinned environment values are used. It returns 202 and a
Workflow run ID after enqueueing. Observe the QIR run using the existing owned
run API and inspect engine details in the Vercel Workflows dashboard.

A duplicate enqueue can create another Workflow record; per-run leases and
checkpoint idempotency protect execution and saving. This is an operator pilot,
not yet a general customer-facing submission endpoint.

## Bounds and failure behavior

Each Workflow has at most 12 journal transitions, with two durable retries per
transition for store/lease interruptions. Leases use a 30-second TTL and
10-second heartbeat. The coding executor has one repair attempt. Gateway calls
have no SDK retries or direct-provider/model fallback, at most 80,000 prompt
characters, 4,096 output tokens and a 90-second timeout. Gateway may still route
among providers for the selected model. Gateway quota refusals stop recovery;
raw SDK errors, prompts and keys are not copied into the journal.

Reported token counts and available Gateway cost are attached to completed
coding events. Missing cost is null, never assumed to be zero. Gateway billing
remains the authority, including charges from failed/interrupted attempts. A
crash after a provider accepted a call but before the result is durably saved
can repeat that call; this is not an exactly-once billing guarantee.

The dedicated key's budget must be set before live calls. Gateway budgets are
soft limits checked before requests; one crossing request can overshoot. Keep
automatic reload off. No extra paid Agent features are required.

## Deployed synthetic recovery proof

The dedicated `quantora-coding-worker-pilot` project has its own operator key and
Coding Gateway key ($5 total budget, no reset, 30-day expiry). Automatic credit
reload remains off. The isolated worker now has the explicitly authorized
production Supabase credential for the pinned synthetic probe. Customer
execution remains disabled.

`POST /proof` accepts the dedicated admin bearer header and no caller inputs.
It additionally requires `QIR_PILOT_LIVE_PROOF=true` and an exact match between
`QIR_PILOT_PROJECT_ID` and Vercel's injected `VERCEL_PROJECT_ID`. Never enable this
on the web application: the test deliberately terminates a worker process.

The workflow injects a provider 503 once, makes a real Gateway request on retry,
persists the generated quantity function, then exits the isolated worker with
code 17. On recovery it runs 313 independent quantity assertions inside a
60-second Sandbox and stops the Sandbox in a finally block. The provider outage
is simulated; the model call, deployed worker interruption and Sandbox are real.
`GET /proof/:workflowRunId` reports completion and verification evidence.
`DELETE /proof/:workflowRunId` cancels a failed or unwanted synthetic run.

Remote source builds require the repository `.npmrc` (`legacy-peer-deps=true`)
alongside its lockfile. The dedicated project uses Nitro and the build command
`node scripts/build-qir-workflow-vercel.mjs`; do not replace the web project's
Vercel configuration with these worker settings. The matching configuration is
`services/qir-workflow/vercel.pilot.json`; use it only from a checkout linked to
the dedicated worker project, with `vercel --local-config` pointing to that file.

## Production journal probe

The operator-only `/journal-proof` routes are pinned in code to a synthetic
user (`qir-workflow-synthetic-20260912`), run (`qir-workflow-journal-20260912`)
and desk (`qir-workflow-desk-20260912`). They also require the isolated-project
check and matching pilot environment configuration. They cannot accept a
customer ID from the caller.

- `POST /journal-proof` idempotently seeds a durable baseline with a known
  100-item defect and a run requesting the 99-item correction.
- `POST /journal-proof/save-conflict` races two saves in a separate synthetic
  session at the same revision, then checks that a stale retry cannot replace
  the winner. An already-used fixture reports `already-run`, not a fresh pass.
- `POST /runs` queues the real QIR worker against that pinned saved run.
- `GET /journal-proof` reads the durable run, verification evidence and published
  quantity source, including whether the independent test file stayed unchanged.

Provision the synthetic user row first; it is a non-login identity with
`blocked_at` set and an `example.invalid` address. Checkpoints have a foreign key
to this row. The production row has been created through the connected database
management tool.

The baseline includes 306 quantity assertions and a syntax build command.
Production repository verification can now use Vercel's injected OIDC identity
without a long-lived Sandbox token. An explicit null credential override still
refuses execution. The production Supabase REST connection and pinned saved-run probe passed on
2026-09-13; see the evidence below.

## Release gate

Passed locally: Gateway failure/budget/cancellation tests, isolation guards,
main regression suite, build/typecheck, advisory gate, Workflow SIGKILL proof,
and startup of the actual Vercel flow/step bundles. The startup gate reproduces
and prevents a Gateway/Zod initialization crash found in the first cloud run.

The corrected cloud run completed: injected 503 retry, real Gateway generation,
worker exit/recovery, and all 313 assertions in Sandbox. Gateway recorded
$0.000128 total pilot-key model spend (excludes Functions, Workflow and Sandbox).
The failed run was cancelled. See [recorded evidence](./evidence-2026-09-12.json).
The production journal probe also completed through the real worker REST
connection: 306 quantity assertions plus the build passed in Sandbox, the
independent page verifier scored 100, and the corrected source was published
at run version 10 with two visible checkpoints. Original tests remained intact.
Re-enqueuing the completed run left the entire saved result unchanged.

Three defects surfaced and were fixed during this probe: request-scoped OIDC
was missed by an environment-only check; a provider's standalone filepath line
was interpreted as source; and module edits were judged instead of the complete
saved page. Failures never changed the visible baseline. Each operator resume
was recorded with compare-and-swap, preserving prior failures. Final recovery
reused the candidate (`durable-checkpoint`) without another model call. This was
operator-assisted recovery, not proof of automatic recovery from these bugs.

Worker REST save-conflict testing also passed: one concurrent save succeeded,
the other conflicted, and a stale retry could not overwrite the winner.
Recorded total Gateway pilot spend is $0.001068, excluding Vercel infrastructure.
See [journal evidence](./journal-evidence-2026-09-13.json) and the preserved
[event history](./journal-events-2026-09-13.json).

The customer browser-close journey remains unverified. The original generated
app's live cart/Undo checks passed later on 2026-09-13 (see the browser evidence). Keep broad customer server ownership disabled and this PR in
draft until those release checks pass. The earlier synthetic process-exit proof
is separate from this production journal test; an actual provider outage was
not induced.

## Customer handoff audit (2026-09-13)

The synthetic worker proof does not mean the live application submits work to
this worker yet. Before the browser-close release test, connect these existing
seams under an account-and-desk-scoped server capability:

- `AiStudio.jsx` must select server ownership and restore verified checkpoints
  through `useQirCodingRun` for the opted-in desk.
- `useChatStream.js` must call the server submission branch and stop the browser
  model path for that turn. Its current caller uses only `beginAttempt`.
- The authenticated API must durably schedule the Workflow and expose honest
  enqueue failure/retry state. Persisting a runnable journal row alone does not
  enqueue this isolated service. Recovery must cover interruption between save
  and enqueue, without depending on a browser retry.
- Browser-close/reopen must recover both the run and its published checkpoint.

The client submission now explicitly persists `executionOwner: server` before
making the model step runnable. A regression test demonstrated that the old
request omitted the marker required by the worker. Compatibility-mode context
updates do not add the marker. This fixes one prerequisite; it does not enable
customer execution or complete the connections above.

The original Reliability Cart Test (marker QIR-E2E-714) passed live UI checks in
Chrome: all three products rejected Add at 99 without changing totals or adding
an Undo entry; invalid quantities preserved cart/history; Add, Empty Cart and
Reset Sample Cart could be undone. Reload and manual conversation selection
restored the corrected app with an empty cart. The source was not modified or
published. See [browser evidence](./cart-browser-evidence-2026-09-13.json).

Reload selected a different conversation, so automatic return to the last
conversation was not proved. The separate in-app browser signed in but did not
show the original local history. These observations do not establish cross-browser
session continuity. The platform's own run label remains UNVERIFIED; external
UI test observations have not been written into its proof journal.
