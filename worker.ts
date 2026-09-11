#!/usr/bin/env node
/*
 * Standalone QIR worker process — Phase 1.
 *
 * This is a NEW, optional entry point. Nothing else in the repo starts it
 * automatically, imports it, or depends on it existing. server.ts and every
 * Vercel function keep running exactly as before; this proves a Run CAN be
 * driven outside a browser tab and outside a request, not that anything
 * today requires it to be.
 *
 * Usage (proof/dev only right now):
 *   QIR_WORKER_STORE_DIR=/tmp/qir-proof QIR_WORKER_USER_SUB=u1 \
 *     QIR_WORKER_RUN_ID=run-1 node --loader tsx worker.ts
 *
 * It uses the local file-based dev/proof store (api/_lib/qir-local-file-store.ts)
 * and the placeholder heartbeat executor (api/_lib/qir-worker-runtime.ts) —
 * see those files' own doc comments for exactly what is and is not proven by
 * this. It does not talk to Supabase and it does not run on Railway; both are
 * later, separately-gated phases.
 */
import { createLocalFileQirStore } from "./api/_lib/qir-local-file-store.js";
import { heartbeatStepExecutor, runQirWorkerLoop } from "./api/_lib/qir-worker-runtime.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`worker.ts: missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const storeDir = requiredEnv("QIR_WORKER_STORE_DIR");
  const userSub = requiredEnv("QIR_WORKER_USER_SUB");
  const runId = requiredEnv("QIR_WORKER_RUN_ID");
  const maxSteps = process.env.QIR_WORKER_MAX_STEPS ? Number(process.env.QIR_WORKER_MAX_STEPS) : undefined;
  // Purely a test knob (see scripts/qir-worker-crash-resume-proof.mjs): gives
  // a kill/resume proof a real window to send SIGKILL between two committed
  // steps instead of racing a heartbeat loop that has no work to do and so
  // finishes a multi-step run in milliseconds. Never set outside a proof.
  const stepDelayMs = process.env.QIR_WORKER_STEP_DELAY_MS ? Number(process.env.QIR_WORKER_STEP_DELAY_MS) : undefined;

  const store = createLocalFileQirStore(storeDir);
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
