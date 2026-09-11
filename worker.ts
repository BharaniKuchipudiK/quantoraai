#!/usr/bin/env node
/*
 * Standalone QIR worker process.
 *
 * Nothing starts this automatically and the executor remains the heartbeat
 * proof executor. This phase adds exclusive Run ownership before any real
 * model/tool executor is allowed behind the worker.
 *
 * Local Phase-1 proof (lease disabled explicitly by its existing script):
 *   QIR_WORKER_STORE_DIR=/tmp/qir-proof QIR_WORKER_USER_SUB=u1 \
 *     QIR_WORKER_RUN_ID=run-1 node --loader tsx worker.ts
 *
 * Local contention proof:
 *   QIR_WORKER_LEASE=local QIR_WORKER_LEASE_DIR=/tmp/qir-leases ...
 *
 * Production-store manual proof uses the durable Supabase lease by default:
 *   QIR_WORKER_STORE=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     QIR_WORKER_USER_SUB=u1 QIR_WORKER_RUN_ID=run-1 node --loader tsx worker.ts
 */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { createLocalFileQirStore } from "./api/_lib/qir-local-file-store.js";
import { isQirRunStoreConfigured } from "./api/_lib/qir-run-store.js";
import { createSupabaseQirWorkerStore } from "./api/_lib/qir-supabase-worker-store.js";
import {
  createLocalFileQirWorkerLeaseStore,
  createSupabaseQirWorkerLeaseStore,
  type QirWorkerLeasePort,
} from "./api/_lib/qir-worker-lease.js";
import { runWithQirWorkerLease } from "./api/_lib/qir-worker-lease-runtime.js";
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

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`worker.ts: ${name} must be a positive number`);
    process.exit(1);
  }
  return value;
}

function resolveWorkerStore(): { selected: "local" | "supabase"; store: QirDurableStorePort } {
  const selected = String(process.env.QIR_WORKER_STORE || "local").trim().toLowerCase();
  if (selected === "local") {
    return { selected, store: createLocalFileQirStore(requiredEnv("QIR_WORKER_STORE_DIR")) };
  }
  if (selected === "supabase") {
    if (!isQirRunStoreConfigured()) {
      console.error("worker.ts: QIR_WORKER_STORE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
      process.exit(1);
    }
    return { selected, store: createSupabaseQirWorkerStore() };
  }
  console.error(`worker.ts: unsupported QIR_WORKER_STORE ${selected}; expected local or supabase`);
  process.exit(1);
}

function resolveLeaseStore(selectedStore: "local" | "supabase"): QirWorkerLeasePort | null {
  const selected = String(process.env.QIR_WORKER_LEASE || (selectedStore === "supabase" ? "supabase" : "none"))
    .trim().toLowerCase();
  if (selected === "none") {
    if (selectedStore === "supabase") {
      console.error("worker.ts: production Supabase worker execution requires QIR_WORKER_LEASE=supabase");
      process.exit(1);
    }
    return null;
  }
  if (selected === "local") {
    const leaseDir = process.env.QIR_WORKER_LEASE_DIR
      || join(requiredEnv("QIR_WORKER_STORE_DIR"), "worker-leases");
    return createLocalFileQirWorkerLeaseStore(leaseDir);
  }
  if (selected === "supabase") {
    if (selectedStore !== "supabase") {
      console.error("worker.ts: QIR_WORKER_LEASE=supabase requires QIR_WORKER_STORE=supabase");
      process.exit(1);
    }
    return createSupabaseQirWorkerLeaseStore();
  }
  console.error(`worker.ts: unsupported QIR_WORKER_LEASE ${selected}; expected none, local or supabase`);
  process.exit(1);
}

async function main() {
  const userSub = requiredEnv("QIR_WORKER_USER_SUB");
  const runId = requiredEnv("QIR_WORKER_RUN_ID");
  const maxSteps = process.env.QIR_WORKER_MAX_STEPS ? Number(process.env.QIR_WORKER_MAX_STEPS) : undefined;
  const stepDelayMs = process.env.QIR_WORKER_STEP_DELAY_MS ? Number(process.env.QIR_WORKER_STEP_DELAY_MS) : undefined;
  const executionDelayMs = process.env.QIR_WORKER_EXECUTION_DELAY_MS ? Number(process.env.QIR_WORKER_EXECUTION_DELAY_MS) : 0;

  const { selected, store } = resolveWorkerStore();
  const leaseStore = resolveLeaseStore(selected);
  const executor = heartbeatStepExecutor({
    onStepStart: async (stepId, actionId) => {
      console.log(`worker: step-start stepId=${stepId} actionId=${actionId} pid=${process.pid}`);
      if (executionDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, executionDelayMs));
    },
  });

  const drive = () => runQirWorkerLoop(store, executor, userSub, runId, {
    maxSteps,
    stepDelayMs,
    onStep: (step) => console.log(`worker: step-result ${JSON.stringify(step).slice(0, 200)}`),
  });

  console.log(`worker: starting pid=${process.pid} store=${store.kind} lease=${leaseStore?.kind || "none"} run=${runId}`);
  if (!leaseStore) {
    const result = await drive();
    console.log(`worker: loop ended status=${result.status}`);
    process.exit(0);
  }

  const workerId = process.env.QIR_WORKER_ID || `${hostname()}-${process.pid}`;
  const leaseToken = process.env.QIR_WORKER_LEASE_TOKEN || randomUUID();
  const ttlMs = numericEnv("QIR_WORKER_LEASE_TTL_MS", 30_000);
  const heartbeatMs = numericEnv("QIR_WORKER_HEARTBEAT_MS", Math.max(1_000, Math.floor(ttlMs / 3)));
  const leased = await runWithQirWorkerLease({
    leaseStore,
    userSub,
    runId,
    workerId,
    leaseToken,
    ttlMs,
    heartbeatMs,
    onHeartbeat: (status) => console.log(`worker: lease-heartbeat ${status} worker=${workerId}`),
    run: drive,
  });

  if (leased.status === "busy") {
    console.log(`worker: lease-busy run=${runId} owner=${leased.claim.lease?.workerId || "unknown"}`);
    process.exit(0);
  }
  if (leased.status === "completed") {
    console.log(`worker: loop ended status=${leased.result.status}`);
    process.exit(0);
  }
  console.error(`worker: lease ended status=${leased.status}${"diagnosis" in leased && leased.diagnosis ? ` diagnosis=${leased.diagnosis}` : ""}`);
  process.exit(1);
}

main().catch((error) => {
  console.error("worker: fatal", error);
  process.exit(1);
});
