import type {
  QirWorkerLeasePort,
  QirWorkerLeaseClaimResult,
} from "./qir-worker-lease.js";

type QirWorkerLeaseBusyClaim = Extract<QirWorkerLeaseClaimResult, { status: "busy" }>;

export type QirWorkerLeaseRunResult<T> =
  | { status: "completed"; result: T }
  | { status: "busy"; claim: QirWorkerLeaseBusyClaim }
  | { status: "lease-lost" }
  | { status: "unavailable"; diagnosis?: string | null };

/**
 * Hold exclusive ownership of one Run while `run` executes.
 *
 * The heartbeat exists before any real Coding executor is connected so the
 * ownership semantics can be proven independently. If the heartbeat is lost,
 * no success is reported. The next slice will additionally pass cancellation
 * and idempotency context into real external actions before those actions are
 * allowed behind this worker.
 */
export async function runWithQirWorkerLease<T>(input: {
  leaseStore: QirWorkerLeasePort;
  userSub: string;
  runId: string;
  workerId: string;
  leaseToken: string;
  ttlMs: number;
  heartbeatMs: number;
  run: () => Promise<T>;
  onHeartbeat?: (status: "renewed" | "lost" | "unavailable") => void;
}): Promise<QirWorkerLeaseRunResult<T>> {
  if (!Number.isFinite(input.heartbeatMs)
    || input.heartbeatMs < 100
    || input.heartbeatMs >= input.ttlMs) {
    return { status: "unavailable", diagnosis: "invalid-heartbeat-interval" };
  }

  const claim = await input.leaseStore.claim({
    userSub: input.userSub,
    runId: input.runId,
    workerId: input.workerId,
    leaseToken: input.leaseToken,
    ttlMs: input.ttlMs,
  });
  if (claim.status === "busy") return { status: "busy", claim };
  if (claim.status !== "acquired") return { status: "unavailable", diagnosis: claim.diagnosis || null };

  let leaseLost = false;
  let heartbeatInFlight: Promise<void> | null = null;
  const heartbeat = () => {
    if (heartbeatInFlight || leaseLost) return;
    heartbeatInFlight = input.leaseStore.heartbeat({
      userSub: input.userSub,
      runId: input.runId,
      workerId: input.workerId,
      leaseToken: input.leaseToken,
      ttlMs: input.ttlMs,
    }).then((result) => {
      if (result.status === "renewed") input.onHeartbeat?.("renewed");
      else {
        leaseLost = true;
        input.onHeartbeat?.(result.status === "lost" ? "lost" : "unavailable");
      }
    }).finally(() => {
      heartbeatInFlight = null;
    });
  };

  const timer = setInterval(heartbeat, input.heartbeatMs);
  timer.unref?.();
  try {
    const result = await input.run();
    if (heartbeatInFlight) await heartbeatInFlight;
    return leaseLost ? { status: "lease-lost" } : { status: "completed", result };
  } finally {
    clearInterval(timer);
    if (heartbeatInFlight) await heartbeatInFlight.catch(() => undefined);
    await input.leaseStore.release({
      userSub: input.userSub,
      runId: input.runId,
      workerId: input.workerId,
      leaseToken: input.leaseToken,
    }).catch(() => undefined);
  }
}
