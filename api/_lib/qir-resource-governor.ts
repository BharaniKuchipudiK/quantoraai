import type { QirFailureCode, QirResourceBudget, QirRunStatus } from "./qir-contracts.js";

export const QIR_RESOURCE_GOVERNOR_VERSION = "qir-resource-governor-2026-09-02.1";

export type QirResourceLane = "ordinary" | "recovery" | "premium";

export type QirResourceRequest = {
  lane: QirResourceLane;
  units: number;
};

export type QirResourceDisposition = {
  version: string;
  allowed: boolean;
  disposition: "allow" | "wait";
  recommendedStatus: QirRunStatus | null;
  failureCode: QirFailureCode | null;
  lane: QirResourceLane;
  requestedUnits: number;
  remainingUnits: number | null;
  reason: string;
};

function validUnits(units: number): boolean {
  return Number.isFinite(units) && Number.isInteger(units) && units > 0;
}

function remainingForLane(budget: QirResourceBudget, lane: QirResourceLane): number | null {
  if (lane === "recovery") return budget.recoveryReserveRemaining;
  if (lane === "premium") return budget.premiumEscalationRemaining;
  return budget.stepUnitsRemaining;
}

function budgetWait(
  request: QirResourceRequest,
  remainingUnits: number | null,
  reason: string,
): QirResourceDisposition {
  return {
    version: QIR_RESOURCE_GOVERNOR_VERSION,
    allowed: false,
    disposition: "wait",
    recommendedStatus: "WAITING_FOR_CAPACITY",
    failureCode: "BUDGET_WAIT",
    lane: request.lane,
    requestedUnits: request.units,
    remainingUnits,
    reason,
  };
}

/**
 * Pure Phase-3 resource decision seam.
 *
 * Important: this function does not debit a budget. Persistence/accounting remains
 * owned by the durable Run journal. It only decides whether the requested lane is
 * currently permitted, so ordinary work cannot silently consume protected recovery
 * or premium capacity.
 */
export function evaluateQirResourceGovernor(input: {
  budget: QirResourceBudget;
  request: QirResourceRequest;
  capacityAvailable: boolean;
}): QirResourceDisposition {
  const { budget, request } = input;

  if (!validUnits(request.units)) {
    return budgetWait(request, remainingForLane(budget, request.lane), "Requested resource units must be a positive integer.");
  }

  if (!input.capacityAvailable) {
    return {
      version: QIR_RESOURCE_GOVERNOR_VERSION,
      allowed: false,
      disposition: "wait",
      recommendedStatus: "WAITING_FOR_CAPACITY",
      failureCode: "CAPACITY_WAIT",
      lane: request.lane,
      requestedUnits: request.units,
      remainingUnits: remainingForLane(budget, request.lane),
      reason: "Execution capacity is temporarily unavailable; checkpoint and resume the same Run when capacity returns.",
    };
  }

  if (request.lane === "ordinary") {
    if (budget.runUnitsRemaining !== null && budget.runUnitsRemaining < request.units) {
      return budgetWait(request, budget.runUnitsRemaining, "Ordinary Run allowance is exhausted; protected reserves remain isolated.");
    }
    if (budget.stepUnitsRemaining !== null && budget.stepUnitsRemaining < request.units) {
      return budgetWait(request, budget.stepUnitsRemaining, "Ordinary Step allowance is exhausted; recovery reserve remains available for diagnosis/failover.");
    }
  }

  const laneRemaining = remainingForLane(budget, request.lane);
  if (laneRemaining !== null && laneRemaining < request.units) {
    const label = request.lane === "recovery" ? "Recovery reserve" : "Premium escalation reserve";
    return budgetWait(request, laneRemaining, `${label} does not have enough remaining units for this action.`);
  }

  return {
    version: QIR_RESOURCE_GOVERNOR_VERSION,
    allowed: true,
    disposition: "allow",
    recommendedStatus: null,
    failureCode: null,
    lane: request.lane,
    requestedUnits: request.units,
    remainingUnits: laneRemaining,
    reason: request.lane === "ordinary"
      ? "Ordinary Run and Step allowances permit the action."
      : request.lane === "recovery"
        ? "Protected recovery reserve permits the action independently of ordinary Step allowance."
        : "Premium escalation reserve permits the explicitly selected escalation action.",
  };
}
