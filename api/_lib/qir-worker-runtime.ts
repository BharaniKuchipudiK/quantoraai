/*
 * PHASE 1 OF THE QIR WORKER PLAN.
 *
 * api/_lib/qir-workflow-adapter.ts already says out loud what is true today:
 * "the engine is Quantora's own request handler ... it is simply an
 * in-process one." The actual driver of a Run's next step lives in the
 * browser tab (src/lib/qir-coding-run-core.js), which calls /api/chat and
 * /api/qir-runs per turn. If that tab closes, nothing advances the Run even
 * though the durable journal (qir-run-store.ts) is perfectly safe.
 *
 * This module is the same lifecycle decision — "given the current durable
 * state, what happens next, and how do we commit the result" — with the
 * request and the browser both removed, so it can be driven by a standalone
 * Node process (worker.ts) instead of a browser tab. It depends on nothing
 * but a store port and an executor port: no `req`/`res`, no `localStorage`,
 * no `fetch` to this app's own endpoints.
 *
 * WHAT THIS DOES NOT DO (read this before assuming more than is here):
 *   - It does not run a real model or tool call. QirStepExecutor is a port;
 *     the only implementation shipped here (heartbeatStepExecutor) is an
 *     honest placeholder that proves the loop's mechanics — claim, execute,
 *     commit, resume — without pretending to think. Wiring a real model/tool
 *     executor is later work, gated on this proof, not done in this file.
 *   - It does not talk to Supabase. QirDurableStorePort is implemented for
 *     production by wrapping qir-run-store.ts (not done in this PR) and, for
 *     this PR's proof only, by qir-local-file-store.ts — a dev-only stand-in
 *     that is never wired into any production code path.
 *   - It does not run on Railway. Nothing here changes where any existing
 *     code executes; worker.ts (repo root) is a new, optional entry point
 *     that nothing else imports or starts automatically.
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

/**
 * The seam a worker process needs: read the latest durable snapshot, and
 * commit an observation against it with optimistic concurrency (the same
 * expectedVersion contract qir-run-store.ts already uses in production).
 * Anything that satisfies this shape — Supabase-backed or otherwise — can
 * drive the same loop below.
 */
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

/**
 * The seam that decides what actually happens for a claimed step. Phase 1
 * ships exactly one implementation (heartbeatStepExecutor) below, and it is
 * intentionally not a model/tool loop — see the module doc comment.
 */
export type QirStepExecutor = {
  readonly kind: string;
  execute(run: QirAgentRun, continuation: QirStepContinuation): Promise<QirObservation>;
};

export type QirWorkerStepResult =
  | { status: "advanced"; run: QirAgentRun }
  | { status: "stopped"; run: QirAgentRun }
  | { status: "no-run" }
  | { status: "conflict" }
  | { status: "unavailable"; diagnosis?: { cause: string; remedy: string } | null };

/**
 * True once the durable cursor has actually claimed the step the
 * continuation names — i.e. api/qir-runs.ts's own startModelAttempt pattern
 * has already run for it (cursor.stepId matches, cursor.actionId matches the
 * step's actionId, and the step is "active"). Until then there is nothing
 * yet to execute against: claiming and executing are two separate durable
 * commits here, exactly as they are in the request-driven path, so a crash
 * between them loses no more than the unclaimed step it was about to start.
 */
function stepIsClaimed(run: QirAgentRun, continuation: QirStepContinuation): boolean {
  if (run.cursor.stepId !== continuation.stepId) return false;
  const step = run.steps.find((candidate) => candidate.stepId === continuation.stepId);
  return Boolean(step && step.status === "active" && step.actionId === run.cursor.actionId);
}

/**
 * Claim the step the continuation named: set the durable cursor onto it and
 * mark the step "active", the same transition startModelAttempt performs in
 * api/qir-runs.ts. Committed as its own event so a crash right after the
 * claim leaves a Run any worker (including a fresh one) can still see is
 * claimed, rather than one that looks untouched and gets claimed twice.
 */
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

/**
 * One step of the worker loop. Reads the durable snapshot fresh every time
 * (no cached in-memory Run survives a crash, by construction — there is
 * nothing else to survive it with), so a process that dies here loses at
 * most the one step in flight and never a step already committed.
 */
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

  const observation = await executor.execute(record.run, continuation);

  const reduced = reduceQirObservation({
    run: record.run,
    observation,
    // "verification_required" (not "verified") is the honest status for an
    // observation this executor produced itself: nothing has independently
    // verified it yet. A failed observation is "blocked" — it cannot be
    // marked done until the failure is addressed. Only a real verifier
    // (Phase 2+) can ever emit "verified".
    proofOfDoneStatus: (observation.status === "success" ? "verification_required" : "blocked") as ProofOfDoneStatus,
  });
  if (!reduced.accepted) {
    // Someone else already advanced past this action between our read and
    // our execute; nothing to commit, and the caller should just re-poll.
    return { status: "stopped", run: record.run };
  }

  const commit = await store.commitEvent({
    userSub,
    runId,
    expectedVersion: record.storageVersion,
    eventId: observation.observationId,
    eventType: observation.status === "failure" ? "observation.failed" : "observation.succeeded",
    run: reduced.run,
    payload: { actionId: observation.actionId, kind: observation.kind },
  });

  if (commit.status === "conflict") return { status: "conflict" };
  if (commit.status === "not_found") return { status: "no-run" };
  if (commit.status !== "committed") return { status: "unavailable", diagnosis: commit.diagnosis || null };

  return { status: "advanced", run: commit.record.run };
}

export type QirWorkerLoopOptions = {
  /** Stop after this many committed steps even if the Run could continue. */
  maxSteps?: number;
  /** Delay between committed steps, purely to make interleavings observable in tests. */
  stepDelayMs?: number;
  onStep?: (result: QirWorkerStepResult) => void;
};

/**
 * Drives stepQirRunOnce until the Run stops, there is nothing left to claim,
 * or maxSteps is reached. This is the function worker.ts calls in a loop; it
 * has no knowledge of processes, signals, or how it is hosted.
 */
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

/**
 * The Phase 1 placeholder executor. It performs one real, observable side
 * effect per step (an append to a JSON-lines log at `sideEffectLogPath`, if
 * given) so a crash test can prove the difference between "the step's work
 * ran" and "the step's completion was durably committed" — then returns a
 * successful observation. It never calls a model or a tool. Naming it
 * "heartbeat" is deliberate: it proves the loop is alive, nothing more.
 */
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
