import assert from "node:assert/strict";
import test from "node:test";

import {
  futureValue,
  requiredMonthly,
  monthsToReach,
  projectSavings,
  formatSavingsPlan,
} from "./savings-goal.js";

test("futureValue with no return is linear", () => {
  assert.equal(futureValue(2000, 400, 0, 36), 2000 + 400 * 36); // 16400
});

test("futureValue with a return exceeds the no-return value", () => {
  assert.ok(futureValue(2000, 400, 5, 36) > futureValue(2000, 400, 0, 36));
});

test("projectSavings reports on-track with a surplus", () => {
  const p = projectSavings({ goal: 15000, current: 2000, monthly: 400, annualRatePct: 0, months: 36 });
  assert.equal(p.onTrack, true);
  assert.equal(p.projected, 16400);
  assert.equal(p.surplus, 1400);
  assert.equal(p.shortfall, 0);
});

test("projectSavings reports a shortfall with the required monthly and time-to-goal", () => {
  const p = projectSavings({ goal: 20000, current: 2000, monthly: 400, annualRatePct: 0, months: 36 });
  assert.equal(p.onTrack, false);
  assert.equal(p.shortfall, 3600);
  assert.equal(p.requiredMonthly, 500); // (20000-2000)/36
  assert.equal(p.monthsToGoal, 45); // 2000 + 400*45 = 20000
});

test("requiredMonthly with no return is the plain shortfall spread over the horizon", () => {
  assert.equal(requiredMonthly(20000, 2000, 0, 36), 500);
});

test("monthsToReach returns null when it never gets there", () => {
  assert.equal(monthsToReach(20000, 2000, 0, 0), null); // no contribution, no return
});

test("formatSavingsPlan renders on-track and shortfall cases honestly", () => {
  const ok = formatSavingsPlan(
    { goal: 15000, current: 2000, monthly: 400, annualRatePct: 0, months: 36 },
    projectSavings({ goal: 15000, current: 2000, monthly: 400, annualRatePct: 0, months: 36 }),
  );
  assert.match(ok, /On track/);
  assert.match(ok, /deterministic projection/);

  const short = formatSavingsPlan(
    { goal: 20000, current: 2000, monthly: 400, annualRatePct: 0, months: 36 },
    projectSavings({ goal: 20000, current: 2000, monthly: 400, annualRatePct: 0, months: 36 }),
  );
  assert.match(short, /Short of the goal/);
  assert.match(short, /save \*\*500\.00\/month\*\*/);
});
