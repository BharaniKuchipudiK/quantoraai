import assert from "node:assert/strict";
import test from "node:test";

import { simulatePayoff, comparePayoff, formatDebtPlan, type Debt } from "./debt-payoff.js";

const card: Debt = { name: "Card", balance: 2000, apr: 25, minPayment: 40 };
const loan: Debt = { name: "Loan", balance: 500, apr: 10, minPayment: 15 };

test("simulates a feasible single-debt payoff", () => {
  const r = simulatePayoff([{ name: "X", balance: 1000, apr: 12, minPayment: 0 }], 100, "avalanche");
  assert.equal(r.feasible, true);
  assert.ok(r.months > 0 && r.months < 24);
  assert.ok(r.totalInterest > 0);
  assert.deepEqual(r.order, ["X"]);
});

test("avalanche targets the highest APR first; snowball the smallest balance", () => {
  const av = simulatePayoff([card, loan], 300, "avalanche");
  const sn = simulatePayoff([card, loan], 300, "snowball");
  assert.equal(av.order[0], "Card"); // 25% APR cleared first
  assert.equal(sn.order[0], "Loan"); // 500 balance cleared first
  assert.equal(av.feasible, true);
  assert.equal(sn.feasible, true);
});

test("avalanche never pays more interest than snowball", () => {
  const av = simulatePayoff([card, loan], 300, "avalanche");
  const sn = simulatePayoff([card, loan], 300, "snowball");
  assert.ok(av.totalInterest <= sn.totalInterest + 0.01);
});

test("flags an infeasible plan when the budget only covers interest", () => {
  const r = simulatePayoff([{ name: "Big", balance: 10000, apr: 30, minPayment: 10 }], 0, "avalanche");
  assert.equal(r.feasible, false);
  assert.match(r.reason || "", /clear|interest|budget/i);
});

test("comparePayoff recommends the cheaper strategy and reports the gap", () => {
  const c = comparePayoff([card, loan], 300);
  assert.equal(c.recommended, "avalanche");
  assert.ok(c.interestSaved >= 0);
});

test("formatDebtPlan renders a recommendation, and refuses when infeasible", () => {
  const ok = formatDebtPlan(comparePayoff([card, loan], 300), { assumedMinimums: true });
  assert.match(ok, /Recommended: (Avalanche|Snowball)/);
  assert.match(ok, /deterministic simulation/);
  assert.match(ok, /assumed/i);

  const bad = formatDebtPlan(comparePayoff([{ name: "Big", balance: 10000, apr: 30, minPayment: 10 }], 0));
  assert.match(bad, /can't build a payoff plan/);
});

test("empty debt list is trivially feasible", () => {
  assert.equal(simulatePayoff([], 100, "avalanche").feasible, true);
});

test("an affordable-monthly below the minimums ends the simulation instead of dating it", () => {
  const debts = [
    { name: "Home loan", balance: 400000, apr: 4, minPayment: 18000 },
    { name: "Cards", balance: 60000, apr: 24, minPayment: 7000 },
  ];
  // 25,000 of minimums against 15,000 coming in.
  const r = simulatePayoff(debts, 0, "avalanche", 15000);
  assert.equal(r.feasible, false);
  assert.match(String(r.reason), /shortfall of 10000\.00/);
  assert.equal(r.months, 0);

  // Without the constraint the same numbers still simulate — the old callers are unchanged.
  assert.equal(simulatePayoff(debts, 0, "avalanche").feasible, true);
});

test("an affordable-monthly that covers the minimums does not interfere", () => {
  const debts = [{ name: "Card", balance: 5000, apr: 20, minPayment: 150 }];
  const with_ = simulatePayoff(debts, 300, "avalanche", 2000);
  const without = simulatePayoff(debts, 300, "avalanche");
  assert.equal(with_.feasible, true);
  assert.equal(with_.months, without.months);
  assert.equal(with_.totalInterest, without.totalInterest);
});

test("the shortfall refusal does not tell someone underwater to pay more", () => {
  const debts = [
    { name: "Home loan", balance: 400000, apr: 4, minPayment: 18000 },
    { name: "Cards", balance: 60000, apr: 24, minPayment: 7000 },
  ];
  const text = formatDebtPlan(comparePayoff(debts, 0, 15000));
  assert.match(text, /shortfall of 10000\.00/);
  assert.doesNotMatch(text, /increase the amount you can put/);
  assert.doesNotMatch(text, /Debt-free in/);
  assert.match(text, /consolidation at a lower rate|longer term/);
});

/*
 * The simulation always knew the month each debt clears — it recorded the
 * clearance inside the month that produced it and then discarded the month.
 * That number is the entire substance of a payoff landmark, so it is now
 * carried out of the engine.
 */
test("records the month each debt is cleared, consistent with the order", () => {
  const debts = [
    { name: "Barclaycard", balance: 3200, apr: 22.9, minPayment: 80 },
    { name: "Car loan", balance: 8400, apr: 7.4, minPayment: 210 },
    { name: "Store card", balance: 900, apr: 29.9, minPayment: 25 },
  ];
  const r = simulatePayoff(debts, 400, "avalanche");
  assert.equal(r.feasible, true);
  assert.deepEqual(r.cleared.map((c) => c.name), r.order, "cleared must mirror the payoff order");
  // Months are strictly increasing, all within the run, and the last is the finish.
  let previous = 0;
  for (const c of r.cleared) {
    assert.ok(c.month > previous, `${c.name} must clear after the one before it`);
    assert.ok(c.month <= r.months, `${c.name} cannot clear after the payoff completes`);
    previous = c.month;
  }
  assert.equal(r.cleared[r.cleared.length - 1].month, r.months, "the last clearance IS the payoff month");
});

test("an infeasible payoff reports no clearances to date", () => {
  const r = simulatePayoff([{ name: "Card", balance: 20000, apr: 30, minPayment: 1 }], 0, "avalanche");
  assert.equal(r.feasible, false);
  assert.deepEqual(r.cleared, []);
});
