import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdvisoryPlan,
  formatAdvisoryPlan,
  applyWhatIf,
  buildWhatIfComparison,
  formatWhatIfComparison,
} from "./finance-advisor-synthesis.js";
import type { FinancialProfile } from "./financial-profile.js";

const COMPLETE: FinancialProfile = {
  goalAmount: 1_000_000,
  goalCurrency: "SGD",
  horizonYears: 20,
  riskTolerance: "moderate",
  monthlyInvestable: 2000,
  monthlyCurrency: "SGD",
};

test("an incomplete profile yields a refusal, not a fabricated plan", () => {
  const plan = buildAdvisoryPlan({ ...COMPLETE, riskTolerance: null, monthlyInvestable: null });
  assert.equal(plan.complete, false);
  assert.equal(plan.projection, null);
  const text = formatAdvisoryPlan(plan);
  assert.match(text, /Before I build a plan/i);
  assert.match(text, /won't invent them/i);
});

test("a complete profile produces a grounded feasibility result", () => {
  const plan = buildAdvisoryPlan(COMPLETE, { current: 50_000 });
  assert.equal(plan.complete, true);
  assert.equal(plan.assumedReturnPct, 5, "moderate -> 5% assumption");
  assert.deepEqual(plan.allocation, { growth: 60, defensive: 40 });
  assert.ok(plan.projection);
  const text = formatAdvisoryPlan(plan);
  assert.match(text, /planning assumption, not a forecast/i);
  assert.match(text, /not\*\* personalized investment advice/i);
  assert.match(text, /60% growth assets \/ 40% defensive/);
});

test("the plan reports goal-probability across scenarios (Monte Carlo)", () => {
  const plan = buildAdvisoryPlan(COMPLETE, { current: 50_000 });
  assert.ok(plan.monteCarlo, "a complete plan carries a Monte Carlo result");
  assert.ok(plan.monteCarlo!.probabilityPct >= 0 && plan.monteCarlo!.probabilityPct <= 100);
  const text = formatAdvisoryPlan(plan);
  assert.match(text, /The odds, across 1,000 scenarios/);
  assert.match(text, /1,000 simulated return paths/);
  assert.match(text, /a range beats a single number/i);
  // This profile is short of the goal, so it should solve for the contribution.
  assert.ok(plan.monteCarloTargetMonthly !== null);
  assert.match(text, /raise your contribution to roughly/i);
});

test("the plan states a required monthly when the pace falls short", () => {
  const tight: FinancialProfile = { ...COMPLETE, monthlyInvestable: 200 };
  const plan = buildAdvisoryPlan(tight, { current: 0 });
  assert.equal(plan.complete, true);
  assert.equal(plan.projection!.onTrack, false);
  const text = formatAdvisoryPlan(plan);
  assert.match(text, /Short as it stands/i);
  assert.match(text, /would take about/i);
});

test("raises balance-sheet cautions: thin emergency fund, high-interest debt, unsustainable contribution", () => {
  const bs = {
    incomeMonthly: 5000, expensesMonthly: 4500, emergencyFund: 4500, liquidCash: 2000,
    assets: [], liabilities: [{ label: "credit card", amount: 8000, currency: "SGD", aprPct: 24 }],
    currency: "SGD", mixedCurrency: false,
    totalAssets: 6500, totalLiabilities: 8000, netWorth: -1500,
    monthlySurplus: 500, savingsRatePct: 10, emergencyMonths: 1,
  };
  const plan = buildAdvisoryPlan(COMPLETE, { current: 0, balanceSheet: bs });
  const text = formatAdvisoryPlan(plan);
  assert.match(text, /emergency fund covers ~1\.0 months/i);
  assert.match(text, /credit card.*at 24%.*high-interest/i);
  assert.match(text, /more than your monthly surplus/i, "SGD 2,000 planned vs 500 surplus");
  assert.match(text, /From your balance sheet/);
});

test("no balance sheet -> no cautions section", () => {
  const plan = buildAdvisoryPlan(COMPLETE, { current: 0 });
  assert.deepEqual(plan.notes, []);
  assert.doesNotMatch(formatAdvisoryPlan(plan), /From your balance sheet/);
});

test("applyWhatIf moves only the stated levers", () => {
  assert.deepEqual(applyWhatIf(COMPLETE, { addMonthly: 500 }).monthlyInvestable, 2500);
  assert.deepEqual(applyWhatIf(COMPLETE, { monthlyOverride: 4000 }).monthlyInvestable, 4000);
  assert.deepEqual(applyWhatIf(COMPLETE, { horizonYears: 30 }).horizonYears, 30);
  assert.deepEqual(applyWhatIf(COMPLETE, { risk: "aggressive" }).riskTolerance, "aggressive");
  assert.deepEqual(applyWhatIf(COMPLETE, { goalOverride: 2_000_000 }).goalAmount, 2_000_000);
  // Untouched fields stay put.
  assert.equal(applyWhatIf(COMPLETE, { addMonthly: 500 }).horizonYears, 20);
});

test("what-if raises the odds and renders a like-for-like comparison", () => {
  const cmp = buildWhatIfComparison(COMPLETE, { addMonthly: 1500 }, { current: 50_000 });
  assert.equal(cmp.applicable, true);
  assert.ok(cmp.scenario.monteCarlo!.probabilityPct >= cmp.base.monteCarlo!.probabilityPct, "more per month never lowers the odds");
  const text = formatWhatIfComparison(cmp);
  assert.match(text, /What-if — Contribution/);
  assert.match(text, /SGD 2,000 → SGD 3,500\/month/);
  assert.match(text, /Goal odds:/);
  assert.match(text, /Median outcome:/);
  assert.match(text, /like-for-like comparison, not a forecast/i);
});

test("a what-if carries the scenario's balance-sheet cautions, not just better odds", () => {
  const bs = {
    incomeMonthly: 5000, expensesMonthly: 4500, emergencyFund: 20000, liquidCash: 5000,
    assets: [], liabilities: [],
    currency: "SGD", mixedCurrency: false,
    totalAssets: 25000, totalLiabilities: 0, netWorth: 25000,
    monthlySurplus: 500, savingsRatePct: 10, emergencyMonths: 6,
  };
  // Raising the contribution to SGD 4,000/month blows past the SGD 500 surplus —
  // the lift must not be sold without that sustainability catch.
  const cmp = buildWhatIfComparison(COMPLETE, { monthlyOverride: 4000 }, { current: 0, balanceSheet: bs });
  assert.ok(cmp.scenario.notes.some((n) => /more than your monthly surplus/i.test(n)));
  const text = formatWhatIfComparison(cmp);
  assert.match(text, /Worth flagging under this scenario/);
  assert.match(text, /more than your monthly surplus/i);
});

test("an incomplete profile makes the comparison inapplicable (gateway falls back)", () => {
  const cmp = buildWhatIfComparison(
    { ...COMPLETE, riskTolerance: null, monthlyInvestable: null },
    { addMonthly: 500 },
  );
  assert.equal(cmp.applicable, false);
  assert.equal(cmp.base.complete, false);
});

test("risk tolerance drives the assumption and the framework", () => {
  const aggressive = buildAdvisoryPlan({ ...COMPLETE, riskTolerance: "aggressive" });
  assert.equal(aggressive.assumedReturnPct, 7);
  assert.deepEqual(aggressive.allocation, { growth: 80, defensive: 20 });
  const conservative = buildAdvisoryPlan({ ...COMPLETE, riskTolerance: "conservative" });
  assert.equal(conservative.assumedReturnPct, 3);
  assert.deepEqual(conservative.allocation, { growth: 30, defensive: 70 });
});
