import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { QIR_CONTRACT_VERSION, type QirAgentRun } from "./qir-contracts.js";
import { readLocalFileQirRunRaw, seedLocalFileQirRun } from "./qir-local-file-store.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const USER_SUB = "lease-proof-user";
const RUN_ID = "lease-proof-run";

function seedRun(): QirAgentRun {
  const now = new Date().toISOString();
  return {
    version: QIR_CONTRACT_VERSION,
    runId: RUN_ID,
    goal: { statement: "prove exclusive worker ownership", status: "confirmed" },
    status: "EXECUTING",
    steps: [
      { stepId: "step-0", taskId: "task-0", objective: "first", dependsOn: [], status: "pending", requiresVerification: false, actionId: null },
      { stepId: "step-1", taskId: "task-1", objective: "second", dependsOn: ["step-0"], status: "pending", requiresVerification: false, actionId: null },
    ],
    cursor: { stepId: null, actionId: null, attempt: 0 },
    artifacts: [],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: { runUnitsRemaining: 20, stepUnitsRemaining: 20, recoveryReserveRemaining: 4, premiumEscalationRemaining: 2 },
    createdAt: now,
    updatedAt: now,
  };
}

type RunningWorker = {
  child: ChildProcessWithoutNullStreams;
  log: () => string;
};

function startWorker(input: {
  storeDir: string;
  leaseDir: string;
  workerId: string;
  executionDelayMs?: number;
}): RunningWorker {
  const child = spawn(join(ROOT, "node_modules", ".bin", "tsx"), ["worker.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      QIR_WORKER_STORE: "local",
      QIR_WORKER_STORE_DIR: input.storeDir,
      QIR_WORKER_LEASE: "local",
      QIR_WORKER_LEASE_DIR: input.leaseDir,
      QIR_WORKER_USER_SUB: USER_SUB,
      QIR_WORKER_RUN_ID: RUN_ID,
      QIR_WORKER_ID: input.workerId,
      QIR_WORKER_LEASE_TTL_MS: "1200",
      QIR_WORKER_HEARTBEAT_MS: "300",
      QIR_WORKER_EXECUTION_DELAY_MS: String(input.executionDelayMs || 0),
    },
    stdio: "pipe",
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, log: () => output };
}

function killWorker(worker: RunningWorker) {
  try { process.kill(-worker.child.pid!, "SIGKILL"); } catch { /* already gone */ }
  try { worker.child.kill("SIGKILL"); } catch { /* already gone */ }
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function waitForExit(worker: RunningWorker, timeoutMs: number) {
  await waitFor(
    () => worker.child.exitCode !== null || worker.child.signalCode !== null,
    timeoutMs,
    `worker ${worker.child.pid} exit`,
  );
}

test("two workers cannot execute one Run concurrently; expired owner is reclaimable after SIGKILL", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "qir-worker-contention-"));
  const storeDir = join(root, "runs");
  const leaseDir = join(root, "leases");
  seedLocalFileQirRun(storeDir, USER_SUB, seedRun());

  const workerA = startWorker({ storeDir, leaseDir, workerId: "worker-a", executionDelayMs: 5_000 });
  try {
    // A has claimed the Run and entered the executor. Its heartbeat must keep
    // the lease alive while that executor is deliberately stalled.
    await waitFor(() => /worker: step-start/.test(workerA.log()), 8_000, "worker A to start the claimed step");
    await waitFor(() => /lease-heartbeat renewed/.test(workerA.log()), 3_000, "worker A to renew its lease");

    const workerB = startWorker({ storeDir, leaseDir, workerId: "worker-b" });
    await waitForExit(workerB, 5_000);
    assert.match(workerB.log(), /worker: lease-busy/, "a second worker is refused while the owner lease is live");
    assert.doesNotMatch(workerB.log(), /worker: step-start/, "the refused worker never enters the executor");

    const beforeKill = readLocalFileQirRunRaw(storeDir, USER_SUB, RUN_ID);
    assert.ok(beforeKill, "the durable Run still exists");
    assert.equal(beforeKill!.run.steps.filter((step) => step.status === "succeeded").length, 0,
      "worker A was killed before it could commit a successful observation");

    killWorker(workerA);
    await waitForExit(workerA, 5_000);

    // The dead owner cannot release its lease. Expiry is therefore the only
    // recovery mechanism; wait beyond the last heartbeat + TTL.
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    const workerC = startWorker({ storeDir, leaseDir, workerId: "worker-c" });
    await waitFor(() => /worker: loop ended/.test(workerC.log()), 10_000, "replacement worker to finish the Run");
    await waitForExit(workerC, 5_000);
    assert.doesNotMatch(workerC.log(), /worker: lease-busy/, "expired ownership is reclaimable");
    assert.match(workerC.log(), /worker: step-start/, "the replacement worker actually resumes execution");

    const final = readLocalFileQirRunRaw(storeDir, USER_SUB, RUN_ID);
    assert.ok(final, "the durable Run remains readable after reclaim");
    assert.ok(final!.run.steps.every((step) => step.status === "succeeded"), "replacement worker advances all remaining steps");
    assert.equal(new Set(final!.committedEventIds).size, final!.committedEventIds.length,
      "no durable event is double-applied during contention/reclaim");
  } finally {
    killWorker(workerA);
    rmSync(root, { recursive: true, force: true });
  }
});
