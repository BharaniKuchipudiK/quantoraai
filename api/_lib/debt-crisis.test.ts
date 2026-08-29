import assert from "node:assert/strict";
import test from "node:test";

import { aprToFitPayment, paymentForTerm } from "./debt-consolidation.js";
import {
  assessCrisis,
  analyzeConsolidation,
  buildCrisisPlan,
  formatCrisisPlan,
  sanitizeDebts,
} from "./debt-crisis.js";
import type { Debt } from "./debt-payoff.js";

/*
 * This file used to carry its own amortizedPayment and maxRateForPayment,
 * duplicating debt-consolidation.ts. The functions are gone; these assertions
 * are not, because what they pin is still true and now cross-checks the one
 * surviving engine against the expectations this strategist was built on.
 */
test("the shared amortising payment matches the standard loan formula", () => {
  assert.equal(paymentForTerm(12000, 0, 12), 1000, "0% -> principal/months");
  const p = paymentForTerm(25000, 12, 60);
  assert.ok(Math.abs(p - 556.11) < 1, `~556/mo, got ${p}`);
});

test("the shared rate solver finds a fitting rate, or null when nothing fits", () => {
  const rate = aprToFitPayment(25000, 60, 600);
  assert.ok(rate !== null && rate > 0 && rate < 20, `a plausible max rate, got ${rate}`);
  // Payment can't even cover principal over the term -> no rate works.
  assert.equal(aprToFitPayment(25000, 36, 100), null);
});

const DEBTS: Debt[] = [
  { name: "credit card", balance: 15000, apr: 24, minPayment: 400 },
  { name: "personal loan", balance: 10000, apr: 9, minPayment: 300 },
];

test("assessCrisis classifies severity and the monthly gap", () => {
  const shortfall = assessCrisis({ incomeMonthly: 5000, essentialExpenses: 4300, debts: DEBTS, currency: "SGD" });
  assert.equal(shortfall.availableForDebt, 700);
  assert.equal(shortfall.totalMinPayments, 700);
  assert.equal(shortfall.severity, "tight");

  const deep = assessCrisis({ incomeMonthly: 5000, essentialExpenses: 4600, debts: DEBTS, currency: "SGD" });
  assert.equal(deep.gap, 300, "700 min - 400 available");
  assert.equal(deep.severity, "shortfall");

  const critical = assessCrisis({ incomeMonthly: 4000, essentialExpenses: 4200, debts: DEBTS, currency: "SGD" });
  assert.equal(critical.severity, "critical");

  assert.equal(deep.highestApr?.name, "credit card", "highest APR surfaced");
  assert.ok(Math.abs(deep.blendedAprPct - 18) < 0.01, "blended 24/9 weighted by balance");
});

test("analyzeConsolidation models a concrete offer and a budget-fit", () => {
  const a = assessCrisis({ incomeMonthly: 8000, essentialExpenses: 6500, debts: DEBTS, currency: "SGD" });
  const offer = analyzeConsolidation(a, { apr: 10, months: 60 });
  assert.equal(offer.kind, "offer");
  assert.ok(offer.payment && offer.payment > 0);

  const fit = analyzeConsolidation(a); // available = 1500/mo
  assert.equal(fit.kind, "fit-to-budget");
  assert.ok(fit.ratePct !== null && fit.ratePct >= 0);
});

test("consolidation is honestly infeasible when even a 0% loan exceeds the budget", () => {
  const a = assessCrisis({ incomeMonthly: 5000, essentialExpenses: 4800, debts: DEBTS, currency: "SGD" }); // 200/mo
  const cons = analyzeConsolidation(a);
  assert.equal(cons.kind, "infeasible");
});

test("the plan leads with a verdict, lays out options, and ends in the human's decision", () => {
  const plan = buildCrisisPlan({ incomeMonthly: 5000, essentialExpenses: 4600, debts: DEBTS, currency: "SGD" });
  const text = formatCrisisPlan(plan, { assumedMinimums: true });
  assert.match(text, /Straight answer/i, "decisive verdict up front");
  assert.match(text, /short of even the minimum payments/i);
  assert.match(text, /\*\*Your options\*\*/);
  assert.match(text, /A — Consolidate/);
  assert.match(text, /D — Negotiate/);
  assert.match(text, /\*\*Your move\*\*/);
  assert.match(text, /I won't pick for you/i, "human-in-the-loop");
  assert.match(text, /not licensed debt advice/i);
});

test("survives adversarial and heavy input without throwing or leaking NaN/Infinity", () => {
  const garbage: any = {
    incomeMonthly: NaN,
    essentialExpenses: -50,
    currency: "SGD",
    debts: [
      { name: "", balance: Infinity, apr: 99999, minPayment: NaN },
      { name: "ok", balance: -100, apr: -5, minPayment: "x" },
      ...Array.from({ length: 500 }, (_, i) => ({ name: `d${i}`, balance: 1000, apr: 20, minPayment: 20 })),
    ],
  };
  let text = "";
  assert.doesNotThrow(() => {
    const plan = buildCrisisPlan(garbage, { offer: { apr: Infinity, months: 999999 } as any });
    text = formatCrisisPlan(plan, { assumedMinimums: true });
  });
  assert.doesNotMatch(text, /NaN|Infinity|undefined/);
  assert.match(text, /Your move/, "still produces a full plan");
});

test("sanitizeDebts caps count, drops non-positive balances, and clamps absurd APR", () => {
  const cleaned = sanitizeDebts([
    { name: "a", balance: 1000, apr: 500, minPayment: 10 },
    { name: "b", balance: 0, apr: 10, minPayment: 5 },
    ...Array.from({ length: 400 }, () => ({ name: "x", balance: 1, apr: 5, minPayment: 1 })),
  ] as any);
  assert.ok(cleaned.length <= 200, "count capped");
  assert.equal(cleaned[0].apr, 200, "APR clamped to 200");
  assert.ok(cleaned.every((d) => d.balance > 0), "zero balances dropped");
});

test("a comfortable case tells you to redirect the surplus, not that it's a crisis", () => {
  const plan = buildCrisisPlan({ incomeMonthly: 12000, essentialExpenses: 5000, debts: DEBTS, currency: "SGD" });
  const text = formatCrisisPlan(plan);
  assert.match(text, /to spare/i);
  assert.match(text, /Redirect the surplus|Attack it as-is/i);
});
