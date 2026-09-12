import { randomUUID } from "node:crypto";
import type { QirRunnableRunRef } from "./qir-run-store.js";
import type { QirWorkerLeasePort } from "./qir-worker-lease.js";
import { runWithQirWorkerLease } from "./qir-worker-lease-runtime.js";

export type QirWorkerDispatchResult = {
  discovered: number;
  acquired: number;
  busy: number;
  completed: number;
  failed: number;
};

export async function runQirWorkerDispatchCycle(input: {
  listRunnableRuns: () => Promise<QirRunnableRunRef[] | null>;
  leaseStore: QirWorkerLeasePort;
  workerId: string;
  ttlMs: number;
  heartbeatMs: number;
  driveRun: (run: QirRunnableRunRef) => Promise<unknown>;
  leaseToken?: () => string;
  onEvent?: (message: string) => void;
}): Promise<QirWorkerDispatchResult> {
  const refs = await input.listRunnableRuns();
  const result: QirWorkerDispatchResult = {
    discovered: refs?.length || 0,
    acquired: 0,
    busy: 0,
    completed: 0,
    failed: refs === null ? 1 : 0,
  };
  if (!refs?.length) return result;

  for (const ref of refs) {
    const leased = await runWithQirWorkerLease({
      leaseStore: input.leaseStore,
      userSub: ref.userSub,
      runId: ref.runId,
      workerId: input.workerId,
      leaseToken: input.leaseToken?.() || randomUUID(),
      ttlMs: input.ttlMs,
      heartbeatMs: input.heartbeatMs,
      onHeartbeat: (status) => input.onEvent?.(`lease-heartbeat ${status} run=${ref.runId}`),
      run: async () => {
        result.acquired += 1;
        return input.driveRun(ref);
      },
    });

    if (leased.status === "busy") {
      result.busy += 1;
      input.onEvent?.(`lease-busy run=${ref.runId}`);
      continue;
    }
    if (leased.status === "completed") {
      result.completed += 1;
      input.onEvent?.(`run-completed run=${ref.runId}`);
      continue;
    }
    result.failed += 1;
    input.onEvent?.(`run-failed run=${ref.runId} status=${leased.status}`);
  }

  return result;
}

export async function runQirWorkerService(input: {
  cycle: () => Promise<QirWorkerDispatchResult>;
  pollMs: number;
  signal?: AbortSignal;
  onCycle?: (result: QirWorkerDispatchResult) => void;
}): Promise<void> {
  const pollMs = Math.max(250, Math.round(Number(input.pollMs) || 2_000));
  while (!input.signal?.aborted) {
    const result = await input.cycle();
    input.onCycle?.(result);
    if (input.signal?.aborted) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, pollMs);
      input.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}
