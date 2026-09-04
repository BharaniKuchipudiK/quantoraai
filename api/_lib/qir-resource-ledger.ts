import type { QirAgentRun, QirResourceBudget } from "./qir-contracts.js";
import {
  evaluateQirResourceGovernor,
  type QirResourceDisposition,
  type QirResourceLane,
} from "./qir-resource-governor.js";
import {
  commitQirRunEvent,
  type QirPersistedRun,
  type QirRunCommitResult,
} from "./qir-run-store.js";

export const QIR_RESOURCE_LEDGER_VERSION = "qir-resource-ledger-2026-09-02.1";

export type QirResourceLedgerRequest = {
  actionId: string;
  lane: QirResourceLane;
  units: number;
  capacityAvailable: boolean;
  eventId: string;
  checkpointId: string;
  now: string;
};

export type QirResourceLedgerReduction = {
  accepted: boolean;
  stale: boolean;
  disposition: QirResourceDisposition | null;
  eventType: "resource.debited" | "resource.waited" | null;
  run: QirAgentRun;
  payload: Record<string, unknown>;
};

function debit(value: number | null, units: number): number | null {
  return value === null ? null : value - units;
}

function debitedBudget(budget: QirResourceBudget, lane: QirResourceLane, units: number): QirResourceBudget {
  if (lane === "recovery") {
    return { ...budget, recoveryReserveRemaining: debit(budget.recoveryReserveRemaining, units) };
  }
  if (lane === "premium") {
    return { ...budget, premiumEscalationRemaining: debit(budget.premiumEscalationRemaining, units) };
  }
  return {
    ...budget,
    runUnitsRemaining: debit(budget.runUnitsRemaining, units),
    stepUnitsRemaining: debit(budget.stepUnitsRemaining, units),
  };
}

function checkpointGenerations(run: QirAgentRun): Record<string, number> {
  return Object.fromEntries(
    run.artifacts
      .filter((artifact) => artifact.state === "verified")
      .map((artifact) => [artifact.artifactId, artifact.generation]),
  );
}

/**
 * Pure reducer for Phase 3.2 resource accounting.
 *
 * The reducer is action-bound: a delayed budget/capacity callback for an older
 * action is a no-op. Ordinary work debits only ordinary Run/Step allowances;
 * recovery and premium work debit only their explicitly selected protected lane.
 */
export function reduceQirResourceRequest(input: {
  run: QirAgentRun;
  request: QirResourceLedgerRequest;
}): QirResourceLedgerReduction {
  const { run, request } = input;
  if (!run.cursor.actionId || request.actionId !== run.cursor.actionId) {
    return {
      accepted: false,
      stale: true,
      disposition: null,
      eventType: null,
      run,
      payload: { actionId: request.actionId, reason: "stale_action" },
    };
  }

  const disposition = evaluateQirResourceGovernor({
    budget: run.budget,
    request: { lane: request.lane, units: request.units },
    capacityAvailable: request.capacityAvailable,
  });

  if (!disposition.allowed) {
    const alreadyCheckpointed = run.checkpoints.some((checkpoint) => checkpoint.checkpointId === request.checkpointId);
    const checkpoints = alreadyCheckpointed
      ? run.checkpoints
      : [...run.checkpoints, {
        checkpointId: request.checkpointId,
        runId: run.runId,
        stepId: run.cursor.stepId,
        actionId: run.cursor.actionId,
        artifactGenerations: checkpointGenerations(run),
        createdAt: request.now,
      }];
    return {
      accepted: true,
      stale: false,
      disposition,
      eventType: "resource.waited",
      run: {
        ...run,
        status: "WAITING_FOR_CAPACITY",
        steps: run.steps.map((step) => step.stepId === run.cursor.stepId ? { ...step, status: "waiting" as const } : step),
        checkpoints,
        updatedAt: request.now,
      },
      payload: {
        version: QIR_RESOURCE_LEDGER_VERSION,
        actionId: request.actionId,
        lane: request.lane,
        units: request.units,
        failureCode: disposition.failureCode,
        checkpointId: request.checkpointId,
      },
    };
  }

  return {
    accepted: true,
    stale: false,
    disposition,
    eventType: "resource.debited",
    run: {
      ...run,
      budget: debitedBudget(run.budget, request.lane, request.units),
      updatedAt: request.now,
    },
    payload: {
      version: QIR_RESOURCE_LEDGER_VERSION,
      actionId: request.actionId,
      lane: request.lane,
      units: request.units,
    },
  };
}

export type QirCapacityResumeReduction = {
  accepted: boolean;
  stale: boolean;
  run: QirAgentRun;
  eventType: "resource.resumed" | null;
  payload: Record<string, unknown>;
};

/** Resume the same Run/cursor/attempt after capacity restoration. */
export function reduceQirCapacityResume(input: {
  run: QirAgentRun;
  actionId: string;
  eventId: string;
  now: string;
}): QirCapacityResumeReduction {
  const { run } = input;
  if (!run.cursor.actionId || input.actionId !== run.cursor.actionId) {
    return { accepted: false, stale: true, run, eventType: null, payload: { actionId: input.actionId, reason: "stale_action" } };
  }
  if (run.status !== "WAITING_FOR_CAPACITY") {
    return { accepted: false, stale: false, run, eventType: null, payload: { actionId: input.actionId, reason: "not_waiting" } };
  }
  return {
    accepted: true,
    stale: false,
    eventType: "resource.resumed",
    run: {
      ...run,
      /*
       * REPLANNING, not EXECUTING.
       *
       * A capacity wait is left by choosing what to do next, not by pretending
       * the parked action is still running. EXECUTING closed both doors out:
       * api/qir-runs.ts starts a Coding attempt only from QUEUED|REPLANNING,
       * and qir-coding-runtime.ts requires REPAIRING|REPLANNING for recovery —
       * so a resumed Run answered 409 to everything and the mission was parked
       * for good. Nothing had ever driven the pair, because nothing calls the
       * governor.
       *
       * This is the contract's own word for the state: failureStatus() in
       * qir-contracts.ts returns REPLANNING for exactly this shape.
       */
      status: "REPLANNING",
      steps: run.steps.map((step) => step.stepId === run.cursor.stepId ? { ...step, status: "active" as const } : step),
      updatedAt: input.now,
    },
    payload: {
      version: QIR_RESOURCE_LEDGER_VERSION,
      actionId: input.actionId,
      checkpointId: [...run.checkpoints].reverse().find((checkpoint) => checkpoint.actionId === input.actionId)?.checkpointId || null,
    },
  };
}

export async function persistQirResourceRequest(input: {
  userSub: string;
  record: QirPersistedRun;
  request: QirResourceLedgerRequest;
}): Promise<QirRunCommitResult | { status: "stale"; record: QirPersistedRun }> {
  const reduced = reduceQirResourceRequest({ run: input.record.run, request: input.request });
  if (!reduced.accepted) return { status: "stale", record: input.record };
  return commitQirRunEvent({
    userSub: input.userSub,
    runId: reduced.run.runId,
    expectedVersion: input.record.storageVersion,
    eventId: input.request.eventId,
    eventType: reduced.eventType!,
    run: reduced.run,
    payload: reduced.payload,
  });
}

export async function persistQirCapacityResume(input: {
  userSub: string;
  record: QirPersistedRun;
  actionId: string;
  eventId: string;
  now: string;
}): Promise<QirRunCommitResult | { status: "stale" | "invalid"; record: QirPersistedRun }> {
  const reduced = reduceQirCapacityResume({
    run: input.record.run,
    actionId: input.actionId,
    eventId: input.eventId,
    now: input.now,
  });
  if (!reduced.accepted) return { status: reduced.stale ? "stale" : "invalid", record: input.record };
  return commitQirRunEvent({
    userSub: input.userSub,
    runId: reduced.run.runId,
    expectedVersion: input.record.storageVersion,
    eventId: input.eventId,
    eventType: reduced.eventType!,
    run: reduced.run,
    payload: reduced.payload,
  });
}
