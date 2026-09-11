#!/usr/bin/env node
/*
 * Standalone QIR worker process.
 *
 * The process is still OPTIONAL: nothing in the repo starts it automatically,
 * imports it from server.ts, or moves production Coding ownership away from
 * the browser/request path. The executor is still the Phase-1 heartbeat proof
 * executor; this slice only lets the process use the same durable production
 * Run journal as the request path when an operator explicitly selects it.
 *
 * Local crash/resume proof (default, unchanged):
 *   QIR_WORKER_STORE_DIR=/tmp/qir-proof QIR_WORKER_USER_SUB=u1 \
 *     QIR_WORKER_RUN_ID=run-1 node --loader tsx worker.ts
 *
 * Explicit production-store bridge (manual only; still heartbeat execution):
 *   QIR_WORKER_STORE=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     QIR_WORKER_USER_SUB=u1 QIR_WORKER_RUN_ID=run-1 node --loader tsx worker.ts
 *
 * `supabase` uses qir-run-store.ts through qir-supabase-worker-store.ts. It
 * does not duplicate persistence or bypass the production CAS/idempotency
 * contract. Railway hosting, run discovery/leasing and a real Coding executor
 * remain later phases.
 */
import { createLocalFileQirStore } from "./api/_lib/qir-local-file-store.js";
import { isQirRunStoreConfigured } from "./api/_lib/qir-run-store.js";
import { createSupabaseQirWorkerStore } from "./api/_lib/qir-supabase-worker-store.js";
import {
  heartbeatStepExecutor,
  runQirWorkerLoop,
  type QirDurableStorePort,
} from "./api/_lib/qir-worker-runtime.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`worker.ts: missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

function resolveWorkerStore(): QirDurableStorePort {
  const selected = String(process.env.QIR_WORKER_STORE || "local").trim().toLowerCase();
  if (selected === "local") {
    return createLocalFileQirStore(requiredEnv("QIR_WORKER_STORE_DIR"));
  }
  if (selected === "supabase") {
    if (!isQirRunStoreConfigured()) {
      console.error("worker.ts: QIR_WORKER_STORE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
      process.exit(1);
    }
    return createSupabaseQirWorkerStore();
  }
  console.error(`worker.ts: unsupported QIR_WORKER_STORE ${selected}; expected local or supabase`);
  process.exit(1);
}

async function main() {
  const userSub = requiredEnv("QIR_WORKER_USER_SUB");
  const runId = requiredEnv("QIR_WORKER_RUN_ID");
  const maxSteps = process.env.QIR_WORKER_MAX_STEPS ? Number(process.env.QIR_WORKER_MAX_STEPS) : undefined;
  // Purely a test knob (see scripts/qir-worker-crash-resume-proof.mjs): gives
  // a kill/resume proof a real window to send SIGKILL between two committed
  // steps instead of racing a heartbeat loop that has no work to do and so
  // finishes a multi-step run in milliseconds. Never set outside a proof.
  const stepDelayMs = process.env.QIR_WORKER_STEP_DELAY_MS ? Number(process.env.QIR_WORKER_STEP_DELAY_MS) : undefined;

  const store = resolveWorkerStore();
  const executor = heartbeatStepExecutor({
    onStepStart: (stepId, actionId) => {
      // One line per step to stdout — this is what the crash/resume proof
      // script reads to know a step actually started before it sends SIGKILL.
      console.log(`worker: step-start stepId=${stepId} actionId=${actionId} pid=${process.pid}`);
    },
  });

  console.log(`worker: starting pid=${process.pid} store=${store.kind} run=${runId}`);
  const result = await runQirWorkerLoop(store, executor, userSub, runId, {
    maxSteps,
    stepDelayMs,
    onStep: (step) => console.log(`worker: step-result ${JSON.stringify(step).slice(0, 200)}`),
  });
  console.log(`worker: loop ended status=${result.status}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("worker: fatal", error);
  process.exit(1);
});
