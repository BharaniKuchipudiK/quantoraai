#!/usr/bin/env node
/* Standalone QIR worker process. */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { createLocalFileQirStore } from "./api/_lib/qir-local-file-store.js";
import { isQirRunStoreConfigured, listRunnableQirRuns } from "./api/_lib/qir-run-store.js";
import { createSupabaseQirWorkerStore } from "./api/_lib/qir-supabase-worker-store.js";
import {
  createLocalFileQirWorkerLeaseStore,
  createSupabaseQirWorkerLeaseStore,
  type QirWorkerLeasePort,
} from "./api/_lib/qir-worker-lease.js";
import { runWithQirWorkerLease } from "./api/_lib/qir-worker-lease-runtime.js";
import { runQirWorkerDispatchCycle, runQirWorkerService } from "./api/_lib/qir-worker-dispatch.js";
import { createQirServerCodingExecutor } from "./api/_lib/qir-server-coding-executor.js";
import {
  heartbeatStepExecutor,
  runQirWorkerLoop,
  type QirDurableStorePort,
  type QirStepExecutor,
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

function optionalIdentity(name: string): string {
  return String(process.env[name] || "").trim();
}

function resolveWorkerStore(): { selected: "local" | "supabase"; store: QirDurableStorePort } {
  const selected = String(process.env.QIR_WORKER_STORE || "local").trim().toLowerCase();
  if (selected === "local") return { selected, store: createLocalFileQirStore(requiredEnv("QIR_WORKER_STORE_DIR")) };
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
    const leaseDir = process.env.QIR_WORKER_LEASE_DIR || join(requiredEnv("QIR_WORKER_STORE_DIR"), "worker-leases");
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

function resolveExecutor(input: { serviceMode: boolean; executionDelayMs: number }): QirStepExecutor {
  const defaultName = input.serviceMode ? "server-coding" : "heartbeat";
  const selected = String(process.env.QIR_WORKER_EXECUTOR || defaultName).trim().toLowerCase();
  if (selected === "server-coding") return createQirServerCodingExecutor({ modelId: process.env.QIR_WORKER_MODEL });
  if (selected === "heartbeat") {
    if (input.serviceMode && process.env.QIR_WORKER_ALLOW_HEARTBEAT_SERVICE !== "1") {
      console.error("worker.ts: heartbeat service mode is proof-only; set QIR_WORKER_ALLOW_HEARTBEAT_SERVICE=1 explicitly");
      process.exit(1);
    }
    return heartbeatStepExecutor({
      onStepStart: async (stepId, actionId) => {
        console.log(`worker: step-start stepId=${stepId} actionId=${actionId} pid=${process.pid}`);
        if (input.executionDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, input.executionDelayMs));
      },
    });
  }
  console.error(`worker.ts: unsupported QIR_WORKER_EXECUTOR ${selected}; expected server-coding or heartbeat`);
  process.exit(1);
}

async function main() {
  const explicitUserSub = optionalIdentity("QIR_WORKER_USER_SUB");
  const explicitRunId = optionalIdentity("QIR_WORKER_RUN_ID");
  if (Boolean(explicitUserSub) !== Boolean(explicitRunId)) {
    console.error("worker.ts: QIR_WORKER_USER_SUB and QIR_WORKER_RUN_ID must be supplied together");
    process.exit(1);
  }
  const serviceMode = !explicitUserSub && !explicitRunId;
  const maxSteps = process.env.QIR_WORKER_MAX_STEPS ? Number(process.env.QIR_WORKER_MAX_STEPS) : undefined;
  const stepDelayMs = process.env.QIR_WORKER_STEP_DELAY_MS ? Number(process.env.QIR_WORKER_STEP_DELAY_MS) : undefined;
  const executionDelayMs = process.env.QIR_WORKER_EXECUTION_DELAY_MS ? Number(process.env.QIR_WORKER_EXECUTION_DELAY_MS) : 0;

  const { selected, store } = resolveWorkerStore();
  const leaseStore = resolveLeaseStore(selected);
  const executor = resolveExecutor({ serviceMode, executionDelayMs });
  const workerId = process.env.QIR_WORKER_ID || `${hostname()}-${process.pid}`;
  const ttlMs = numericEnv("QIR_WORKER_LEASE_TTL_MS", 30_000);
  const heartbeatMs = numericEnv("QIR_WORKER_HEARTBEAT_MS", Math.max(1_000, Math.floor(ttlMs / 3)));

  if (!serviceMode) {
    const drive = (signal?: AbortSignal) => runQirWorkerLoop(store, executor, explicitUserSub, explicitRunId, {
      maxSteps,
      stepDelayMs,
      signal,
      onStep: (step) => console.log(`worker: step-result ${JSON.stringify(step).slice(0, 200)}`),
    });
    console.log(`worker: starting single-run pid=${process.pid} store=${store.kind} executor=${executor.kind} lease=${leaseStore?.kind || "none"} run=${explicitRunId}`);
    if (!leaseStore) {
      const result = await drive();
      console.log(`worker: loop ended status=${result.status}`);
      process.exit(0);
    }
    const leased = await runWithQirWorkerLease({
      leaseStore,
      userSub: explicitUserSub,
      runId: explicitRunId,
      workerId,
      leaseToken: process.env.QIR_WORKER_LEASE_TOKEN || randomUUID(),
      ttlMs,
      heartbeatMs,
      onHeartbeat: (status) => console.log(`worker: lease-heartbeat ${status} worker=${workerId}`),
      run: ({ signal }) => drive(signal),
    });
    if (leased.status === "busy") {
      console.log(`worker: lease-busy run=${explicitRunId} owner=${leased.claim.lease?.workerId || "unknown"}`);
      process.exit(0);
    }
    if (leased.status === "completed") {
      console.log(`worker: loop ended status=${leased.result.status}`);
      process.exit(0);
    }
    console.error(`worker: lease ended status=${leased.status}${"diagnosis" in leased && leased.diagnosis ? ` diagnosis=${leased.diagnosis}` : ""}`);
    process.exit(1);
  }

  if (selected !== "supabase" || !leaseStore) {
    console.error("worker.ts: service mode requires QIR_WORKER_STORE=supabase with the durable Supabase lease");
    process.exit(1);
  }
  if (executor.kind === "server-coding" && process.env.QIR_WORKER_ENABLE_SERVER_CODING !== "1") {
    console.error("worker.ts: server Coding service is built but cutover is disabled; set QIR_WORKER_ENABLE_SERVER_CODING=1 only when the browser ownership cutover is ready");
    process.exit(1);
  }

  const pollMs = numericEnv("QIR_WORKER_POLL_MS", 2_000);
  const discoveryLimit = Math.max(1, Math.min(100, Math.round(numericEnv("QIR_WORKER_DISCOVERY_LIMIT", 32))));
  const maxStepsPerRun = Math.max(1, Math.round(numericEnv("QIR_WORKER_MAX_STEPS_PER_DISPATCH", 8)));
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  console.log(`worker: starting service pid=${process.pid} store=${store.kind} executor=${executor.kind} lease=${leaseStore.kind} pollMs=${pollMs}`);
  await runQirWorkerService({
    pollMs,
    signal: abort.signal,
    cycle: () => runQirWorkerDispatchCycle({
      listRunnableRuns: () => listRunnableQirRuns(discoveryLimit),
      leaseStore,
      workerId,
      ttlMs,
      heartbeatMs,
      onEvent: (message) => console.log(`worker: ${message}`),
      driveRun: (ref, signal) => runQirWorkerLoop(store, executor, ref.userSub, ref.runId, {
        maxSteps: maxStepsPerRun,
        stepDelayMs,
        signal,
        onStep: (step) => console.log(`worker: step-result run=${ref.runId} ${JSON.stringify(step).slice(0, 200)}`),
      }),
    }),
    onCycle: (result) => console.log(`worker: dispatch ${JSON.stringify(result)}`),
  });
  console.log("worker: service stopped");
}

main().catch((error) => {
  console.error("worker: fatal", error);
  process.exit(1);
});
