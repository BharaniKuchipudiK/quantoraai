/**
 * A mission that waits for capacity must be able to start working again.
 *
 * WHY THIS FILE EXISTS. The Resource & Budget Governor is complete and nothing
 * calls it, so this path has never run. Reading it before wiring it up found a
 * round trip with no exit:
 *
 *   governor refuses premium  ->  status WAITING_FOR_CAPACITY   (ledger)
 *   capacity resume           ->  status EXECUTING              (ledger)
 *   coding.attempt requires   ->  QUEUED | REPLANNING           (api/qir-runs.ts)
 *
 * So the moment premium budget runs out, the Run parks — and the designed
 * recovery, persistQirCapacityResume, hands it back in a state the attempt
 * endpoint answers 409 to. Wiring the governor without fixing that would ship a
 * permanently stalled mission: the exact class #516 removed when a spent TURN
 * budget was sealing the whole Run.
 *
 * Two components also disagreed about whether the wait is continuable.
 * deriveQirContinuation says yes (the step is "waiting", which it accepts);
 * coding.attempt said no. That is duplicate authority inside the Run state
 * machine itself — exit answer #6's class, one layer below where the Phase 0
 * re-audit found it.
 *
 * These tests drive the REAL reducers and read the route's OWN guard, so they
 * cannot pass against a hand-written idea of what the states are.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { QIR_CONTRACT_VERSION, deriveQirContinuation, type QirAgentRun } from "./qir-contracts.js";
import { reduceQirCapacityResume, reduceQirResourceRequest } from "./qir-resource-ledger.js";

/** A Run mid-build, with a premium reserve too small for the request below. */
function runAwaitingPremium(premiumRemaining: number | null): QirAgentRun {
  return {
    version: QIR_CONTRACT_VERSION,
    runId: "capacity-roundtrip-run",
    goal: { statement: "Build the boutique storefront", status: "confirmed" },
    status: "EXECUTING",
    steps: [{
      stepId: "render-storefront",
      taskId: "coding.render",
      objective: "Render the storefront",
      dependsOn: [],
      status: "active",
      requiresVerification: true,
      actionId: "action-build-1",
    }],
    cursor: { stepId: "render-storefront", actionId: "action-build-1", attempt: 1 },
    artifacts: [],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: 100,
      stepUnitsRemaining: 40,
      recoveryReserveRemaining: 20,
      premiumEscalationRemaining: premiumRemaining,
    },
    createdAt: "2026-09-03T02:00:00.000Z",
    updatedAt: "2026-09-03T02:00:05.000Z",
  };
}

const REQUEST = {
  actionId: "action-build-1",
  lane: "premium" as const,
  units: 1,
  capacityAvailable: true,
  eventId: "resource-1",
  checkpointId: "checkpoint-resource-1",
  now: "2026-09-03T02:00:10.000Z",
};

/** The statuses api/qir-runs.ts will start a new model attempt from. */
function attemptStartableStatuses(): string[] {
  const source = fs.readFileSync(new URL("../qir-runs.ts", import.meta.url), "utf8");
  const match = source.match(/if \(!\[([^\]]+)\]\.includes\(record\.run\.status\)\)/);
  assert.ok(
    match,
    "could not find the coding.attempt status guard in api/qir-runs.ts — if it moved, this test is "
    + "no longer reading the real rule and must be repointed rather than deleted",
  );
  return match[1].split(",").map((entry) => entry.trim().replace(/^["']|["']$/g, ""));
}

test("a premium reserve that cannot fund the request parks the Run, by design", () => {
  const refused = reduceQirResourceRequest({ run: runAwaitingPremium(0), request: REQUEST });

  assert.equal(refused.accepted, true, "the refusal is a recorded decision, not a dropped request");
  assert.equal(refused.disposition?.allowed, false);
  assert.equal(refused.run.status, "WAITING_FOR_CAPACITY");
  assert.equal(refused.eventType, "resource.waited");
  assert.equal(
    refused.run.budget.premiumEscalationRemaining,
    0,
    "a refused request must not be charged for",
  );
});

test("an affordable request is debited rather than parked", () => {
  const granted = reduceQirResourceRequest({ run: runAwaitingPremium(5), request: REQUEST });

  assert.equal(granted.disposition?.allowed, true);
  assert.equal(granted.eventType, "resource.debited");
  assert.equal(granted.run.status, "EXECUTING", "a grant must not change the Run's status");
  assert.equal(
    granted.run.budget.premiumEscalationRemaining,
    4,
    "the premium lane must actually decrement — an undebited budget is the defect the audit named",
  );
});

test("[was-red] the capacity round trip returns the mission to a state it can work from", () => {
  /*
   * THE BUG. reduceQirCapacityResume returned EXECUTING, and coding.attempt
   * starts only from QUEUED or REPLANNING. Both halves were individually
   * reasonable; composed, they had no exit, and nothing exercised the pair.
   */
  const parked = reduceQirResourceRequest({ run: runAwaitingPremium(0), request: REQUEST });
  assert.equal(parked.run.status, "WAITING_FOR_CAPACITY", "guard: the setup must actually park it");

  const resumed = reduceQirCapacityResume({
    run: parked.run,
    actionId: "action-build-1",
    eventId: "capacity-resume-1",
    now: "2026-09-03T02:01:00.000Z",
  });
  assert.equal(resumed.accepted, true, "a parked Run must be resumable");

  const startable = attemptStartableStatuses();
  assert.ok(
    startable.includes(resumed.run.status),
    `capacity resume returns ${resumed.run.status}, but api/qir-runs.ts starts a Coding attempt only `
    + `from [${startable.join(", ")}]. The mission is parked with no way back in: the governor refuses, `
    + 'the resume "succeeds", and every following attempt answers 409.',
  );
});

test('[was-red] the two authorities agree that a parked mission is continuable', () => {
  /*
   * deriveQirContinuation is what a fresh worker consults to decide where to
   * pick up. If it and the attempt guard disagree, resume works in one reader
   * and 409s in the other — which is how a Run ends up alive on paper and dead
   * in practice.
   */
  const parked = reduceQirResourceRequest({ run: runAwaitingPremium(0), request: REQUEST });

  assert.ok(
    deriveQirContinuation(parked.run),
    'deriveQirContinuation must still offer a cursor while waiting for capacity',
  );

  const resumed = reduceQirCapacityResume({
    run: parked.run,
    actionId: "action-build-1",
    eventId: "capacity-resume-1",
    now: "2026-09-03T02:01:00.000Z",
  });
  assert.ok(deriveQirContinuation(resumed.run), 'and after the resume');
  assert.ok(
    attemptStartableStatuses().includes(resumed.run.status),
    'both authorities must accept the resumed state, not just one',
  );
});

test('a resume is refused when the Run was never waiting', () => {
  const notWaiting = reduceQirCapacityResume({
    run: runAwaitingPremium(5),
    actionId: "action-build-1",
    eventId: "capacity-resume-1",
    now: "2026-09-03T02:01:00.000Z",
  });
  assert.equal(notWaiting.accepted, false);
  assert.equal(notWaiting.payload.reason, "not_waiting");
});
