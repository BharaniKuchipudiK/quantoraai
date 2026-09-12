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
| `QIR_AI_GATEWAY_API_KEY` | Dedicated Coding pilot key; proposed $5 total budget, no automatic refresh, 30-day expiry. |
| `QIR_GATEWAY_MODELS` | Explicit comma-separated allowed model IDs. |
| `QIR_WORKER_MODEL` | One allowed provider/model ID, chosen from the actual eligible catalogue. |
| `ADMIN_API_KEY` | Existing server admin authentication, minimum 16 characters. |

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

## Release gate

Locally passed: Gateway failure/budget/cancellation tests, main regression suite,
main build/typecheck, Vercel-format worker build and local Workflow SIGKILL proof.
Not yet proven: live Gateway request/cost, full production journal/checkpoint
execution in the deployed Workflow, provider failure and worker restart on
Vercel, browser-close behavior, or the generated app's live cart behavior.

Do not enable broad server ownership until those checks pass. The dedicated
key was not created because automatic approval review requested explicit user
approval of credential creation, the $5 total budget, expiry and secure storage.
