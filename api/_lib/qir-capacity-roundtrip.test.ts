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
import { reduceQirCapacityResume, reduceQirResourceRequest, spendOrdinaryUnits } from "./qir-resource-ledger.js";

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

/*
 * THE ORDINARY LANE MUST ACTUALLY BE SPENT.
 *
 * Coding Runs are created with runUnitsRemaining: 100 and stepUnitsRemaining:
 * 40, the governor has full allowance logic for both, and until now nothing
 * ever decremented either — the only governor caller in the repository asks
 * for lane "premium". Phase 3 asks for model accounting; a budget that is
 * displayed and checked but never spent is accounting theatre.
 */

test("[was-red] an ordinary spend debits both nested lanes", () => {
  const budget = { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 };
  const after = spendOrdinaryUnits(budget);

  assert.equal(after.runUnitsRemaining, 99, "the Run allowance must pay for the attempt");
  assert.equal(after.stepUnitsRemaining, 39, "and so must the Step allowance — they are nested, not alternatives");
  assert.equal(after.recoveryReserveRemaining, 20, "the protected reserves stay isolated");
  assert.equal(after.premiumEscalationRemaining, 5);
});

test("[was-red] an exhausted lane floors at zero, and never bricks the Run", () => {
  /*
   * isValidQirRunSnapshot rejects a lane that is not finite and non-negative.
   * A bare subtraction would reach -1 on the attempt after the allowance ran
   * out, and from then on EVERY commit for that Run would fail validation and
   * come back "unavailable" — a Run destroyed by its own bookkeeping, which is
   * the class #516 removed.
   */
  let budget = { runUnitsRemaining: 1, stepUnitsRemaining: 1, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 };
  for (let i = 0; i < 5; i += 1) budget = spendOrdinaryUnits(budget);

  assert.equal(budget.runUnitsRemaining, 0);
  assert.equal(budget.stepUnitsRemaining, 0);
  for (const lane of Object.values(budget)) {
    assert.ok(lane === null || (Number.isFinite(lane) && lane >= 0), `${lane} must satisfy isValidQirRunSnapshot`);
  }
});

test("an unmetered lane stays unmetered", () => {
  /*
   * null means unlimited throughout this spine — the same convention the
   * governor and the premium resolver use. Spending must not turn it into a
   * number and start counting down from nothing.
   */
  const after = spendOrdinaryUnits({ runUnitsRemaining: null, stepUnitsRemaining: null, recoveryReserveRemaining: null, premiumEscalationRemaining: null });
  assert.equal(after.runUnitsRemaining, null);
  assert.equal(after.stepUnitsRemaining, null);
});

test("[was-red] the attempt route actually spends it", () => {
  /*
   * The helper is worthless if nothing calls it — which is precisely how the
   * ordinary lane came to be metered and never spent in the first place.
   */
  const source = fs.readFileSync(new URL("../qir-runs.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /const attemptRun = \{ \.\.\.started\.run, budget: spendOrdinaryUnits\(started\.run\.budget\) \}/,
    "coding.attempt must pay for the attempt out of the ordinary lane",
  );
  assert.match(source, /run: attemptRun,/, "and must commit the debited Run, not the undebited one");
});

test("a debit never refuses an attempt", () => {
  /*
   * The governor's job is to refuse, and that path is exercised for premium.
   * Making a model attempt refusable on an allowance nobody has calibrated is
   * how a build stops running for a reason no user can act on.
   */
  const source = fs.readFileSync(new URL("../qir-runs.ts", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf('action === "coding.attempt"'), source.indexOf('action === "coding.start"'));
  assert.doesNotMatch(handler, /WAITING_FOR_CAPACITY/, "an ordinary spend must not park the Run");
  assert.doesNotMatch(handler, /ordinary allowance is exhausted/i);
});
