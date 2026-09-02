import assert from "node:assert/strict";
import test from "node:test";

import { evaluateQirResourceGovernor } from "./qir-resource-governor.js";
import type { QirResourceBudget } from "./qir-contracts.js";

function budget(overrides: Partial<QirResourceBudget> = {}): QirResourceBudget {
  return {
    runUnitsRemaining: 10,
    stepUnitsRemaining: 3,
    recoveryReserveRemaining: 2,
    premiumEscalationRemaining: 1,
    ...overrides,
  };
}

test("ordinary work cannot consume protected recovery reserve when step allowance is exhausted", () => {
  const decision = evaluateQirResourceGovernor({
    budget: budget({ stepUnitsRemaining: 0, recoveryReserveRemaining: 2 }),
    request: { lane: "ordinary", units: 1 },
    capacityAvailable: true,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.failureCode, "BUDGET_WAIT");
  assert.equal(decision.recommendedStatus, "WAITING_FOR_CAPACITY");
  assert.match(decision.reason, /recovery reserve remains available/i);
});

test("protected recovery remains usable after ordinary step allowance is exhausted", () => {
  const decision = evaluateQirResourceGovernor({
    budget: budget({ stepUnitsRemaining: 0, recoveryReserveRemaining: 2 }),
    request: { lane: "recovery", units: 1 },
    capacityAvailable: true,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.disposition, "allow");
  assert.equal(decision.remainingUnits, 2);
});

test("ordinary run exhaustion waits instead of borrowing from premium or recovery reserves", () => {
  const decision = evaluateQirResourceGovernor({
    budget: budget({ runUnitsRemaining: 0, recoveryReserveRemaining: 4, premiumEscalationRemaining: 4 }),
    request: { lane: "ordinary", units: 1 },
    capacityAvailable: true,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.failureCode, "BUDGET_WAIT");
  assert.equal(decision.remainingUnits, 0);
});

test("temporary execution capacity loss checkpoints the Run instead of becoming terminal", () => {
  const decision = evaluateQirResourceGovernor({
    budget: budget(),
    request: { lane: "ordinary", units: 1 },
    capacityAvailable: false,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.failureCode, "CAPACITY_WAIT");
  assert.equal(decision.recommendedStatus, "WAITING_FOR_CAPACITY");
});

test("premium escalation cannot silently borrow ordinary or recovery capacity", () => {
  const denied = evaluateQirResourceGovernor({
    budget: budget({ premiumEscalationRemaining: 0, runUnitsRemaining: 100, recoveryReserveRemaining: 100 }),
    request: { lane: "premium", units: 1 },
    capacityAvailable: true,
  });
  const allowed = evaluateQirResourceGovernor({
    budget: budget({ premiumEscalationRemaining: 2 }),
    request: { lane: "premium", units: 1 },
    capacityAvailable: true,
  });

  assert.equal(denied.allowed, false);
  assert.equal(denied.remainingUnits, 0);
  assert.equal(allowed.allowed, true);
});

test("null budget counters remain explicit unmetered compatibility rather than fabricated exhaustion", () => {
  const decision = evaluateQirResourceGovernor({
    budget: budget({
      runUnitsRemaining: null,
      stepUnitsRemaining: null,
      recoveryReserveRemaining: null,
      premiumEscalationRemaining: null,
    }),
    request: { lane: "ordinary", units: 1 },
    capacityAvailable: true,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.remainingUnits, null);
});

test("invalid resource requests fail closed into a durable budget wait", () => {
  const decision = evaluateQirResourceGovernor({
    budget: budget(),
    request: { lane: "ordinary", units: 0 },
    capacityAvailable: true,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.failureCode, "BUDGET_WAIT");
  assert.equal(decision.recommendedStatus, "WAITING_FOR_CAPACITY");
});
