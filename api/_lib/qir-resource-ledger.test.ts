import assert from "node:assert/strict";
import test from "node:test";
import { QIR_CONTRACT_VERSION, type QirAgentRun } from "./qir-contracts.js";
import { reduceQirCapacityResume, reduceQirResourceRequest } from "./qir-resource-ledger.js";

function run(overrides: Partial<QirAgentRun> = {}): QirAgentRun {
  return {
    version: QIR_CONTRACT_VERSION,
    runId: "run-budget-1",
    goal: { statement: "Finish and verify the Coding artifact", status: "confirmed" },
    status: "EXECUTING",
    steps: [{
      stepId: "build",
      taskId: "coding.render",
      objective: "Build candidate",
      dependsOn: [],
      status: "active",
      requiresVerification: true,
      actionId: "action-7",
    }],
    cursor: { stepId: "build", actionId: "action-7", attempt: 2 },
    artifacts: [
      { artifactId: "site", generation: 1, ref: "vfs://site/g1", state: "verified", createdByActionId: "action-1", verifiedByActionId: "verify-1" },
      { artifactId: "site-next", generation: 2, ref: "vfs://site/g2", state: "candidate", createdByActionId: "action-7" },
    ],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: 12,
      stepUnitsRemaining: 3,
      recoveryReserveRemaining: 4,
      premiumEscalationRemaining: 2,
    },
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:01:00.000Z",
    ...overrides,
  };
}

const now = "2026-09-02T00:02:00.000Z";

function request(overrides: Record<string, unknown> = {}) {
  return {
    actionId: "action-7",
    lane: "ordinary" as const,
    units: 2,
    capacityAvailable: true,
    eventId: "budget-event-1",
    checkpointId: "budget-checkpoint-1",
    now,
    ...overrides,
  };
}

test("ordinary debit consumes Run+Step only and leaves protected reserves untouched", () => {
  const reduced = reduceQirResourceRequest({ run: run(), request: request() });
  assert.equal(reduced.accepted, true);
  assert.equal(reduced.eventType, "resource.debited");
  assert.equal(reduced.run.budget.runUnitsRemaining, 10);
  assert.equal(reduced.run.budget.stepUnitsRemaining, 1);
  assert.equal(reduced.run.budget.recoveryReserveRemaining, 4);
  assert.equal(reduced.run.budget.premiumEscalationRemaining, 2);
});

test("ordinary Step exhaustion checkpoints and waits without consuming recovery reserve", () => {
  const current = run({ budget: { runUnitsRemaining: 12, stepUnitsRemaining: 1, recoveryReserveRemaining: 4, premiumEscalationRemaining: 2 } });
  const reduced = reduceQirResourceRequest({ run: current, request: request({ units: 2 }) });
  assert.equal(reduced.accepted, true);
  assert.equal(reduced.eventType, "resource.waited");
  assert.equal(reduced.run.status, "WAITING_FOR_CAPACITY");
  assert.equal(reduced.run.cursor.actionId, "action-7");
  assert.equal(reduced.run.cursor.attempt, 2);
  assert.equal(reduced.run.budget.recoveryReserveRemaining, 4);
  assert.equal(reduced.run.steps[0]?.status, "waiting");
  assert.equal(reduced.run.checkpoints.length, 1);
  assert.deepEqual(reduced.run.checkpoints[0]?.artifactGenerations, { site: 1 });
});

test("temporary capacity loss waits even when allowance exists", () => {
  const reduced = reduceQirResourceRequest({ run: run(), request: request({ capacityAvailable: false }) });
  assert.equal(reduced.run.status, "WAITING_FOR_CAPACITY");
  assert.equal(reduced.disposition?.failureCode, "CAPACITY_WAIT");
  assert.equal(reduced.run.budget.stepUnitsRemaining, 3);
});

test("recovery lane remains available after ordinary Step exhaustion and only debits recovery", () => {
  const current = run({ budget: { runUnitsRemaining: 12, stepUnitsRemaining: 0, recoveryReserveRemaining: 4, premiumEscalationRemaining: 2 } });
  const reduced = reduceQirResourceRequest({
    run: current,
    request: request({ lane: "recovery", units: 2 }),
  });
  assert.equal(reduced.eventType, "resource.debited");
  assert.equal(reduced.run.budget.stepUnitsRemaining, 0);
  assert.equal(reduced.run.budget.runUnitsRemaining, 12);
  assert.equal(reduced.run.budget.recoveryReserveRemaining, 2);
  assert.equal(reduced.run.budget.premiumEscalationRemaining, 2);
});

test("premium lane cannot borrow ordinary or recovery capacity", () => {
  const current = run({ budget: { runUnitsRemaining: 99, stepUnitsRemaining: 99, recoveryReserveRemaining: 99, premiumEscalationRemaining: 1 } });
  const reduced = reduceQirResourceRequest({ run: current, request: request({ lane: "premium", units: 2 }) });
  assert.equal(reduced.run.status, "WAITING_FOR_CAPACITY");
  assert.equal(reduced.run.budget.premiumEscalationRemaining, 1);
  assert.equal(reduced.run.budget.runUnitsRemaining, 99);
  assert.equal(reduced.run.budget.recoveryReserveRemaining, 99);
});

test("late resource callback for an older action is a durable no-op", () => {
  const current = run();
  const reduced = reduceQirResourceRequest({ run: current, request: request({ actionId: "action-old" }) });
  assert.equal(reduced.accepted, false);
  assert.equal(reduced.stale, true);
  assert.strictEqual(reduced.run, current);
});

test("capacity resume preserves same Run, cursor, attempt, checkpoint and verified artifact", () => {
  const waiting = reduceQirResourceRequest({
    run: run({ budget: { runUnitsRemaining: 12, stepUnitsRemaining: 0, recoveryReserveRemaining: 4, premiumEscalationRemaining: 2 } }),
    request: request({ units: 1 }),
  }).run;
  const resumed = reduceQirCapacityResume({
    run: JSON.parse(JSON.stringify(waiting)) as QirAgentRun,
    actionId: "action-7",
    eventId: "capacity-resume-1",
    now: "2026-09-02T00:03:00.000Z",
  });
  assert.equal(resumed.accepted, true);
  assert.equal(resumed.run.runId, "run-budget-1");
  assert.equal(resumed.run.status, "EXECUTING");
  assert.equal(resumed.run.cursor.actionId, "action-7");
  assert.equal(resumed.run.cursor.attempt, 2);
  assert.equal(resumed.run.checkpoints.length, 1);
  assert.equal(resumed.run.artifacts[0]?.state, "verified");
  assert.equal(resumed.run.steps[0]?.status, "active");
});

test("late resume callback cannot move a newer action", () => {
  const waiting = run({ status: "WAITING_FOR_CAPACITY", steps: [{
    stepId: "build", taskId: "coding.render", objective: "Build candidate", dependsOn: [], status: "waiting", requiresVerification: true, actionId: "action-7",
  }] });
  const resumed = reduceQirCapacityResume({ run: waiting, actionId: "action-old", eventId: "resume-old", now });
  assert.equal(resumed.accepted, false);
  assert.equal(resumed.stale, true);
  assert.strictEqual(resumed.run, waiting);
});
