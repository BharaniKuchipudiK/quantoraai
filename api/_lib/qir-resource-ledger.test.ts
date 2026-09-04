import assert from "node:assert/strict";
import test from "node:test";
import { QIR_CONTRACT_VERSION, type QirAgentRun } from "./qir-contracts.js";
import { reduceQirCapacityResume, reduceQirResourceRequest, spendOrdinaryUnits } from "./qir-resource-ledger.js";

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
  /*
   * REPLANNING, changed from EXECUTING on 2026-09-04.
   *
   * This assertion recorded what the reducer did, not what the Run could then
   * do. EXECUTING left a resumed mission unable to start a Coding attempt
   * (api/qir-runs.ts requires QUEUED|REPLANNING) and unable to enter recovery
   * (qir-coding-runtime.ts requires REPAIRING|REPLANNING) — so a capacity wait
   * had no exit at all. qir-capacity-roundtrip.test.ts proves the round trip;
   * this line is the old expectation corrected, not a gate relaxed. Everything
   * else this test guards — Run identity, cursor, attempt, checkpoint, the
   * verified artifact, the active step — is unchanged and still asserted below.
   */
  assert.equal(resumed.run.status, "REPLANNING");
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

/*
 * ---------------------------------------------------------------------------
 * TOOL ACCOUNTING (Phase 3's last gap)
 *
 * Model spend became real when coding.attempt began debiting the ordinary lane.
 * A TOOL call cost nothing, so a Run that searched hotels twenty times reported
 * the same budget as one that searched none.
 *
 * Tools debit the SAME lanes as a model attempt rather than a new toolUnits
 * lane: a new lane is a contract field nobody has calibrated, and an allowance
 * invented here would be a number with no evidence behind it. Run and step
 * units already mean "work this Run may do"; a tool call is work. The journal
 * event carries the tool name, so the two stay tellable apart without inventing
 * a budget for one of them.
 * ---------------------------------------------------------------------------
 */
test('a tool call costs the same lanes a model attempt does', () => {
  const budget = { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 };
  const after = spendOrdinaryUnits(budget, 1);
  assert.equal(after.runUnitsRemaining, 99);
  assert.equal(after.stepUnitsRemaining, 39);
  // Protected lanes are for escalation and recovery; an ordinary tool call
  // must never reach them.
  assert.equal(after.recoveryReserveRemaining, 20);
  assert.equal(after.premiumEscalationRemaining, 5);
});

test('many tool calls floor at zero and never brick the Run', () => {
  /*
   * The same trap as the ordinary model lane: isValidQirRunSnapshot rejects a
   * negative lane, so an unfloored subtraction would make every later commit
   * for that Run fail — a Run bricked by its own bookkeeping.
   */
  let budget = { runUnitsRemaining: 2, stepUnitsRemaining: 1, recoveryReserveRemaining: 3, premiumEscalationRemaining: 1 };
  for (let call = 0; call < 8; call += 1) budget = spendOrdinaryUnits(budget, 1);
  assert.equal(budget.runUnitsRemaining, 0);
  assert.equal(budget.stepUnitsRemaining, 0);
  assert.ok((budget.runUnitsRemaining ?? 0) >= 0 && (budget.stepUnitsRemaining ?? 0) >= 0);
});

test('an unlimited lane stays unlimited when a tool runs', () => {
  const budget = { runUnitsRemaining: null, stepUnitsRemaining: null, recoveryReserveRemaining: null, premiumEscalationRemaining: null };
  const after = spendOrdinaryUnits(budget, 3);
  assert.equal(after.runUnitsRemaining, null);
  assert.equal(after.stepUnitsRemaining, null);
});
