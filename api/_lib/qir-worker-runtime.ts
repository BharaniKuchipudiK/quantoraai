/*
 * Request-independent QIR worker runtime.
 *
 * The worker reads durable state fresh for every step, claims a continuation,
 * executes through a QirStepExecutor, and commits through the same optimistic
 * concurrency store contract used by the request path. The executor may return
 * either a plain observation (the original Phase-1 contract) or a fully reduced
 * Run after it has independently verified an artifact. That additive form is
 * what allows the server Coding executor to own model -> artifact -> verifier
 * without routing the work back through a browser request.
 */

import {
  deriveQirContinuation,
  type QirAgentRun,
  type QirObservation,
} from "./qir-contracts.js";
import { reduceQirObservation } from "./qir-run-store.js";
import type { ProofOfDoneStatus } from "./outcome-contract.js";

export type QirPersistedRunLike = {
  run: QirAgentRun;
  storageVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type QirRunCommitResultLike =
  | { status: "committed"; record: QirPersistedRunLike }
  | { status: "conflict" }
  | { status: "not_found" }
  | { status: "unavailable"; diagnosis?: { cause: string; remedy: string } | null };

export type QirDurableStorePort = {
  readonly kind: string;
  readRun(userSub: string, runId: string): Promise<QirPersistedRunLike | null>;
  commitEvent(input: {
    userSub: string;
    runId: string;
    expectedVersion: number;
    eventId: string;
    eventType: string;
    run: QirAgentRun;
    payload?: Record<string, unknown>;
  }): Promise<QirRunCommitResultLike>;
};

export type QirStepContinuation = NonNullable<ReturnType<typeof deriveQirContinuation>>;

export type QirStepExecution = {
  observation: QirObservation;
  /**
   * Optional authoritative Run produced after executor-owned independent
   * verification. When absent, the worker applies the canonical observation
   * reducer exactly as Phase 1 did.
   */
  committedRun?: QirAgentRun;
  eventType?: string;
  payload?: Record<string, unknown>;
};

export type QirStepExecutor = {
  readonly kind: string;
  execute(
    run: QirAgentRun,
    continuation: QirStepContinuation,
    context: { userSub: string; runId: string },
  ): Promise<QirObservation | QirStepExecution>;
};

export type QirWorkerStepResult =
  | { status: "advanced"; run: QirAgentRun }
  | { status: "stopped"; run: QirAgentRun }
  | { status: "no-run" }
  | { status: "conflict" }
  | { status: "unavailable"; diagnosis?: { cause: string; remedy: string } | null };

function stepIsClaimed(run: QirAgentRun, continuation: QirStepContinuation): boolean {
  if (run.cursor.stepId !== continuation.stepId) return false;
  const step = run.steps.find((candidate) => candidate.stepId === continuation.stepId);
  return Boolean(step && step.status === "active" && step.actionId === run.cursor.actionId);
}

function claimQirStep(run: QirAgentRun, continuation: QirStepContinuation, now: string): QirAgentRun {
  const actionId = continuation.actionId || `${continuation.stepId}-action-${Math.random().toString(36).slice(2, 10)}`;
  const steps = run.steps.map((step) => (
    step.stepId === continuation.stepId ? { ...step, status: "active" as const, actionId } : step
  ));
  return {
    ...run,
    status: "EXECUTING",
    steps,
    cursor: { ...run.cursor, stepId: continuation.stepId, actionId },
    updatedAt: now,
  };
}

function normalizeExecution(value: QirObservation | QirStepExecution): QirStepExecution {
  return value && typeof value === "object" && "observation" in value
    ? value as QirStepExecution
    : { observation: value as QirObservation };
}

export async function stepQirRunOnce(
  store: QirDurableStorePort,
  executor: QirStepExecutor,
  userSub: string,
  runId: string,
): Promise<QirWorkerStepResult> {
  const record = await store.readRun(userSub, runId);
  if (!record) return { status: "no-run" };

  const continuation = deriveQirContinuation(record.run);
  if (!continuation) return { status: "stopped", run: record.run };

  if (!stepIsClaimed(record.run, continuation)) {
    const claimed = claimQirStep(record.run, continuation, new Date().toISOString());
    const commit = await store.commitEvent({
      userSub,
      runId,
      expectedVersion: record.storageVersion,
      eventId: `${claimed.cursor.actionId}-claim`,
      eventType: "step.claimed",
      run: claimed,
      payload: { stepId: continuation.stepId, actionId: claimed.cursor.actionId },
    });
    if (commit.status === "conflict") return { status: "conflict" };
    if (commit.status === "not_found") return { status: "no-run" };
    if (commit.status !== "committed") return { status: "unavailable", diagnosis: commit.diagnosis || null };
    return { status: "advanced", run: commit.record.run };
  }

  const execution = normalizeExecution(await executor.execute(record.run, continuation, { userSub, runId }));
  const observation = execution.observation;

  let nextRun = execution.committedRun || null;
  if (!nextRun) {
    const reduced = reduceQirObservation({
      run: record.run,
      observation,
      proofOfDoneStatus: (observation.status === "success" ? "verification_required" : "blocked") as ProofOfDoneStatus,
    });
    if (!reduced.accepted) return { status: "stopped", run: record.run };
    nextRun = reduced.run;
  }

  const commit = await store.commitEvent({
    userSub,
    runId,
    expectedVersion: record.storageVersion,
    eventId: observation.observationId,
    eventType: execution.eventType
      || (observation.status === "failure" ? "observation.failed" : "observation.succeeded"),
    run: nextRun,
    payload: {
      actionId: observation.actionId,
      kind: observation.kind,
      ...(execution.payload || {}),
    },
  });

  if (commit.status === "conflict") return { status: "conflict" };
  if (commit.status === "not_found") return { status: "no-run" };
  if (commit.status !== "committed") return { status: "unavailable", diagnosis: commit.diagnosis || null };
  return { status: "advanced", run: commit.record.run };
}

export type QirWorkerLoopOptions = {
  maxSteps?: number;
  stepDelayMs?: number;
  onStep?: (result: QirWorkerStepResult) => void;
};

export async function runQirWorkerLoop(
  store: QirDurableStorePort,
  executor: QirStepExecutor,
  userSub: string,
  runId: string,
  options: QirWorkerLoopOptions = {},
): Promise<QirWorkerStepResult> {
  const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
  let last: QirWorkerStepResult = { status: "no-run" };
  for (let i = 0; i < maxSteps; i += 1) {
    last = await stepQirRunOnce(store, executor, userSub, runId);
    options.onStep?.(last);
    if (last.status !== "advanced") return last;
    if (options.stepDelayMs) await new Promise((resolve) => { setTimeout(resolve, options.stepDelayMs); });
  }
  return last;
}

/** Phase-1 proof executor retained only for deterministic crash/lease tests. */
export function heartbeatStepExecutor(options: {
  onStepStart?: (stepId: string, actionId: string) => void | Promise<void>;
} = {}): QirStepExecutor {
  return {
    kind: "heartbeat",
    async execute(_run, continuation) {
      const actionId = continuation.actionId || `${continuation.stepId}-action`;
      await options.onStepStart?.(continuation.stepId, actionId);
      return {
        observationId: `${continuation.stepId}-obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        runId: _run.runId,
        actionId,
        kind: "runtime",
        status: "success",
        evidence: [],
        observedAt: new Date().toISOString(),
      };
    },
  };
}
