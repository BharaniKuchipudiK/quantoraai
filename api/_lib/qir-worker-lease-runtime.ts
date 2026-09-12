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
 * The abort signal is the authority boundary for external work. Once a
 * heartbeat reports that ownership is lost/unavailable, the signal fires
 * immediately so provider/tool calls can stop before performing another side
 * effect. Durable idempotency remains the second line of defence for an action
 * that completed immediately before cancellation was observed.
 */
export async function runWithQirWorkerLease<T>(input: {
  leaseStore: QirWorkerLeasePort;
  userSub: string;
  runId: string;
  workerId: string;
  leaseToken: string;
  ttlMs: number;
  heartbeatMs: number;
  run: (context: { signal: AbortSignal }) => Promise<T>;
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
  const ownership = new AbortController();
  const loseLease = (status: "lost" | "unavailable") => {
    if (leaseLost) return;
    leaseLost = true;
    ownership.abort(new Error(`QIR worker lease ${status}`));
    input.onHeartbeat?.(status);
  };
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
      else loseLease(result.status === "lost" ? "lost" : "unavailable");
    }).catch(() => {
      loseLease("unavailable");
    }).finally(() => {
      heartbeatInFlight = null;
    });
  };

  const timer = setInterval(heartbeat, input.heartbeatMs);
  timer.unref?.();
  try {
    const result = await input.run({ signal: ownership.signal });
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
