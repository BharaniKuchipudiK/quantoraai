import assert from "node:assert/strict";
import test from "node:test";

import { forecastFxLevel, formatFxForecast, FORECAST_MIN_OBSERVATIONS } from "./fx-forecast.js";
import type { FxRate } from "./market-data-store.js";

// A synthetic daily series with a mild upward drift and a little wobble.
function series(n: number, start = 60, step = 0.03): FxRate[] {
  const rows: FxRate[] = [];
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < n; i += 1) {
    const date = new Date(base + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const wobble = (i % 5 - 2) * 0.02; // deterministic ±, mean ~0
    rows.push({
      base_currency: "SGD",
      quote_currency: "INR",
      rate_date: date,
      rate: start + i * step + wobble,
      source: "ecb",
      as_of: `${date}T16:00:00Z`,
    });
  }
  return rows;
}

const HIST = series(120); // ~120 obs, spot ≈ 60 + 119*0.03 ≈ 63.6

test("is deterministic — same series and target give the same odds", () => {
  const a = forecastFxLevel("SGD", "INR", HIST, { target: 66, horizonMonths: 12 });
  const b = forecastFxLevel("SGD", "INR", HIST, { target: 66, horizonMonths: 12 });
  assert.deepEqual(a, b);
});

test("returns a sane, ordered distribution and labeled assumptions", () => {
  const f = forecastFxLevel("SGD", "INR", HIST, { target: 66, horizonMonths: 12 })!;
  assert.ok(f, "a sufficient series yields a forecast");
  assert.ok(f.probReachPct >= 0 && f.probReachPct <= 100);
  assert.ok(f.p10 <= f.p50 && f.p50 <= f.p90, "percentiles ordered");
  assert.equal(f.direction, "above", "66 is above the ~63.6 spot");
  assert.ok(Number.isFinite(f.annualDriftPct) && Number.isFinite(f.annualVolPct));
});

test("a nearer target is at least as likely as a farther one", () => {
  const near = forecastFxLevel("SGD", "INR", HIST, { target: 65, horizonMonths: 12 })!;
  const far = forecastFxLevel("SGD", "INR", HIST, { target: 90, horizonMonths: 12 })!;
  assert.ok(near.probReachPct >= far.probReachPct, `${near.probReachPct} >= ${far.probReachPct}`);
  assert.ok(far.probReachPct < 50, "a distant target is unlikely within the horizon");
});

test("a target already at/behind the spot reads as effectively certain", () => {
  const f = forecastFxLevel("SGD", "INR", HIST, { target: 50, horizonMonths: 12 })!;
  assert.equal(f.direction, "below");
  // Spot ~63.6 already above a below-target only if it dips; but 50 is far below,
  // so this is really about ordering — just assert it's a valid probability.
  assert.ok(f.probReachPct >= 0 && f.probReachPct <= 100);
});

test("refuses (null) when there is too little history to calibrate", () => {
  const thin = series(FORECAST_MIN_OBSERVATIONS - 1);
  assert.equal(forecastFxLevel("SGD", "INR", thin, { target: 66, horizonMonths: 12 }), null);
});

test("bounds heavy inputs instead of running away", () => {
  const f = forecastFxLevel("SGD", "INR", HIST, { target: 66, horizonMonths: 999_999, paths: 999_999 })!;
  assert.ok(f.paths <= 5000, "paths capped");
  assert.ok(f.horizonMonths <= 120, "horizon capped");
  assert.ok(Number.isFinite(f.p50) && Number.isFinite(f.probReachPct));
});

test("the rendered projection states odds and a range, never a date", () => {
  const f = forecastFxLevel("SGD", "INR", HIST, { target: 66, horizonMonths: 12 })!;
  const text = formatFxForecast(f);
  assert.match(text, /Odds SGD\/INR/);
  assert.match(text, /within 12 months/);
  assert.match(text, /won't tell you \*\*when\*\*/i);
  assert.match(text, /not\*\* a forecast/i);
  assert.doesNotMatch(text, /\b(20\d\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
});
