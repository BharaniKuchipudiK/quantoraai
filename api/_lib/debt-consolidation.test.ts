import assert from "node:assert/strict";
import test from "node:test";

import {
  aprToFitPayment,
  blendedApr,
  evaluateConsolidation,
  paymentForTerm,
  termToFitPayment,
} from "./debt-consolidation.js";

const DEBTS = [
  { name: "Home loan", balance: 400000, apr: 4, minPayment: 18000 },
  { name: "Cards", balance: 60000, apr: 24, minPayment: 7000 },
];

test("paymentForTerm matches the standard amortisation formula", () => {
  // 100,000 at 6% over 360 months is the textbook 599.55.
  assert.equal(paymentForTerm(100000, 6, 360), 599.55);
  // A zero-rate loan divides evenly.
  assert.equal(paymentForTerm(1200, 0, 12), 100);
  assert.equal(paymentForTerm(0, 5, 12), 0);
  assert.equal(paymentForTerm(1000, 5, 0), 0);
});

test("blendedApr is weighted by balance, not by count", () => {
  // A naive average of 4 and 24 is 14; the balances make it 6.61.
  assert.equal(blendedApr(DEBTS), 6.6087);
  assert.equal(blendedApr([]), 0);
});

test("a longer term can cut the payment while the rate gets worse", () => {
  const r = evaluateConsolidation(DEBTS, { apr: 9, months: 84 }, 15000);
  assert.ok(r);
  assert.equal(r.principal, 460000);
  assert.equal(r.ratesImprove, false); // 9% is worse than the 6.61% blended
  assert.ok(r.monthlyRelief > 0); // yet the monthly payment still falls
  assert.ok(r.newTotalInterest > 0);
});

test("fitsBudget is reported only when a budget is known", () => {
  assert.equal(evaluateConsolidation(DEBTS, { apr: 9, months: 84 })?.fitsBudget, null);
  assert.equal(evaluateConsolidation(DEBTS, { apr: 9, months: 84 })?.remainingShortfall, null);
  const tight = evaluateConsolidation(DEBTS, { apr: 9, months: 24 }, 15000);
  assert.equal(tight?.fitsBudget, false);
  assert.ok((tight?.remainingShortfall ?? 0) > 0);
});

test("an offer that cannot be modelled returns null rather than a guess", () => {
  assert.equal(evaluateConsolidation([], { apr: 9, months: 60 }), null);
  assert.equal(evaluateConsolidation(DEBTS, { apr: 9, months: 0 }), null);
  assert.equal(evaluateConsolidation(DEBTS, { apr: -1, months: 60 }), null);
});

test("a payment that never covers the interest has no term, not a long one", () => {
  // 100,000 at 24% accrues 2,000 a month; paying 1,500 clears nothing, ever.
  assert.equal(termToFitPayment(100000, 24, 1500), null);
  // -ln(1 - 100000*0.02/2500)/ln(1.02) = 81.27, so 82 payments.
  assert.equal(termToFitPayment(100000, 24, 2500), 82);
  assert.equal(termToFitPayment(1200, 0, 100), 12);
});

test("aprToFitPayment inverts paymentForTerm", () => {
  const apr = aprToFitPayment(100000, 360, 599.55);
  assert.ok(apr !== null);
  assert.ok(Math.abs((apr as number) - 6) < 0.01);
  // No rate is low enough when even 0% costs more than the payment.
  assert.equal(aprToFitPayment(100000, 12, 500), null);
});
