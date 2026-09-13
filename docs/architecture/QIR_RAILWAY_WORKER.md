# QIR Coding worker — Railway/container process

> **Alternative host, not the selected pilot.** The current reliability work uses
> an isolated Vercel Workflow worker. Keep this runbook for a future host change;
> do not provision Railway alongside it. See [current closeout](RELIABILITY_CLOSEOUT_2026-09-13.md).

The worker is a separate long-running process from the Quantora web/API service.

## Build

Use the normal repository build:

```sh
npm run build
```

That now emits both:

- `dist/server.mjs` — Quantora web/API server
- `dist/worker.mjs` — QIR background worker

## Worker start command

Configure the Railway worker service start command as:

```sh
npm run start:worker
```

Do **not** set `QIR_WORKER_USER_SUB` or `QIR_WORKER_RUN_ID` in production. Their presence selects the deterministic single-Run proof/debug mode instead of the long-running dispatcher.

## Required worker environment

```text
QIR_WORKER_STORE=supabase
QIR_WORKER_LEASE=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

At least one server model credential must also be available through the same credential paths used by the API service:

```text
GEMINI_API_KEY=...              # direct Gemini route, optional if gateway supplies it
OPENROUTER_API_KEY=...          # OpenRouter route, optional if gateway supplies it
```

The production executor defaults to `gemini-flash-latest`. Override deliberately with:

```text
QIR_WORKER_MODEL=<provider model id>
```

Models whose id begins with `gemini` use the direct Gemini route. Other model ids use OpenRouter.

## Optional tuning

```text
QIR_WORKER_POLL_MS=2000
QIR_WORKER_DISCOVERY_LIMIT=32
QIR_WORKER_MAX_STEPS_PER_DISPATCH=8
QIR_WORKER_LEASE_TTL_MS=30000
QIR_WORKER_HEARTBEAT_MS=10000
QIR_WORKER_ID=<stable replica label>       # otherwise hostname-pid
```

## Ownership and restart behaviour

Every service replica may discover the same runnable Run. `claim_qir_worker_lease` is the exclusive ownership boundary. The owner heartbeats while executing; if the process disappears, the lease expires and another replica may reclaim the same durable Run.

Coding workspace writes use the Run action id as their checkpoint idempotency key. If a worker dies after storing generated source but before committing the Run event, the replacement worker can recognize the already-applied workspace mutation rather than append it a second time.

The browser is not the worker process. PR #709 performs the final UI ownership cutover so a tab only submits/observes/controls these durable Runs.
