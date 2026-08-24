import assert from "node:assert/strict";
import test from "node:test";

import { computeFxAnalytics, fxAnalyticsResult, MIN_OBSERVATIONS } from "./fx-analytics.js";
import type { FxRate } from "./market-data-store.js";
import type { FxAnalyticsIntent } from "./fx-analytics-intent.js";

function series(rates: Array<[string, number]>): FxRate[] {
  return rates.map(([rate_date, rate]) => ({
    base_currency: "USD",
    quote_currency: "SGD",
    rate_date,
    rate,
    source: "ecb",
    as_of: `${rate_date}T16:00:00Z`,
  }));
}

const RISING = series([
  ["2026-01-01", 1.30],
  ["2026-01-02", 1.32],
  ["2026-01-03", 1.31],
  ["2026-01-04", 1.34],
  ["2026-01-05", 1.36],
  ["2026-01-06", 1.39],
]);

test("returns null when there are too few observations", () => {
  const few = series([["2026-01-01", 1.3], ["2026-01-02", 1.31]]);
  assert.equal(few.length < MIN_OBSERVATIONS, true);
  assert.equal(computeFxAnalytics("USD", "SGD", few), null);
});

test("computes change, range, mean and trend from a real series", () => {
  const a = computeFxAnalytics("USD", "SGD", RISING);
  assert.ok(a);
  assert.equal(a!.observations, 6);
  assert.equal(a!.first.rate, 1.30);
  assert.equal(a!.last.rate, 1.39);
  assert.equal(a!.high.rate, 1.39);
  assert.equal(a!.high.date, "2026-01-06");
  assert.equal(a!.low.rate, 1.30);
  assert.equal(a!.low.date, "2026-01-01");
  // (1.39 - 1.30) / 1.30 * 100 ≈ 6.92%
  assert.ok(Math.abs(a!.changePct - 6.923) < 0.01);
  assert.equal(a!.trend, "strengthened");
  assert.ok(a!.dailyVolPct > 0);
  assert.ok(a!.annualizedVolPct > a!.dailyVolPct);
});

test("flat series reads as roughly flat, not a trend", () => {
  const flat = series([
    ["2026-01-01", 1.350],
    ["2026-01-02", 1.351],
    ["2026-01-03", 1.349],
    ["2026-01-04", 1.350],
    ["2026-01-05", 1.351],
  ]);
  const a = computeFxAnalytics("USD", "SGD", flat)!;
  assert.equal(a.trend, "roughly flat");
});

test("sorts out-of-order rows and ignores non-finite / non-positive rates", () => {
  const messy: FxRate[] = [
    ...series([["2026-01-05", 1.36], ["2026-01-01", 1.30], ["2026-01-03", 1.31], ["2026-01-07", 1.40]]),
    { base_currency: "USD", quote_currency: "SGD", rate_date: "2026-01-04", rate: NaN, source: "ecb", as_of: "x" },
    { base_currency: "USD", quote_currency: "SGD", rate_date: "2026-01-02", rate: 1.32, source: "ecb", as_of: "y" },
    { base_currency: "USD", quote_currency: "SGD", rate_date: "2026-01-06", rate: -1, source: "ecb", as_of: "z" },
  ];
  const a = computeFxAnalytics("USD", "SGD", messy)!;
  assert.equal(a.observations, 5, "NaN and negative dropped");
  assert.equal(a.first.date, "2026-01-01");
  assert.equal(a.last.date, "2026-01-07");
});

test("the rendered report cites the range and source and refuses to forecast", () => {
  const intent: FxAnalyticsIntent = { kind: "fx-analytics", base: "USD", quote: "SGD", days: 365 };
  const out = fxAnalyticsResult(intent, RISING);
  assert.equal(out.resolved, true);
  assert.match(out.text, /historical performance/i);
  assert.match(out.text, /2026-01-01 → 2026-01-06/);
  assert.match(out.text, /ECB \(Frankfurter\)/);
  assert.match(out.text, /not\*\* a forecast/i);
});

test("refuses honestly when history is insufficient", () => {
  const intent: FxAnalyticsIntent = { kind: "fx-analytics", base: "USD", quote: "SGD", days: 365 };
  const out = fxAnalyticsResult(intent, series([["2026-01-01", 1.3]]));
  assert.equal(out.resolved, false);
  assert.match(out.text, /don't have enough stored/i);
  assert.match(out.text, /won't fabricate/i);
});
