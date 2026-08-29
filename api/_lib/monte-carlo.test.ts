import assert from "node:assert/strict";
import test from "node:test";

import { simulateGoalProbability } from "./monte-carlo.js";

const BASE = {
  goal: 1_000_000,
  current: 50_000,
  monthlyContribution: 2_000,
  horizonMonths: 240,
  annualReturnPct: 5,
  annualVolPct: 11,
};

test("is deterministic — the same inputs give the same probability every time", () => {
  const a = simulateGoalProbability(BASE);
  const b = simulateGoalProbability(BASE);
  assert.deepEqual(a, b, "seeded PRNG -> reproducible");
});

test("returns a sane, ordered distribution", () => {
  const r = simulateGoalProbability(BASE);
  assert.ok(r.probabilityPct >= 0 && r.probabilityPct <= 100);
  assert.ok(r.p10 <= r.p50 && r.p50 <= r.p90, "percentiles ordered");
  assert.equal(r.hits, Math.round((r.probabilityPct / 100) * r.paths));
});

test("more contribution never lowers the odds", () => {
  const low = simulateGoalProbability({ ...BASE, monthlyContribution: 1_000 });
  const high = simulateGoalProbability({ ...BASE, monthlyContribution: 5_000 });
  assert.ok(high.probabilityPct >= low.probabilityPct, `${high.probabilityPct} >= ${low.probabilityPct}`);
});

test("an already-met goal is a certainty; an impossible one is near zero", () => {
  assert.equal(simulateGoalProbability({ ...BASE, goal: 0 }).probabilityPct, 100);
  const impossible = simulateGoalProbability({ ...BASE, goal: 1e12, monthlyContribution: 1, current: 0 });
  assert.ok(impossible.probabilityPct < 1);
});

test("bounds heavy/garbage inputs instead of hanging or throwing", () => {
  const r = simulateGoalProbability({
    goal: 1_000_000, current: -5, monthlyContribution: 2_000,
    horizonMonths: 999_999, annualReturnPct: 5, annualVolPct: 11, paths: 999_999,
  });
  assert.ok(r.paths <= 5000, "paths capped");
  assert.ok(Number.isFinite(r.p50) && Number.isFinite(r.probabilityPct));
});
