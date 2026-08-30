/**
 * Probabilistic FX projection (ADR-025) — the honest answer to "when will SGD
 * hit 80 INR?". It never names a date. Instead it calibrates drift and
 * volatility from the STORED ECB history and runs a seeded Monte Carlo of the
 * rate forward, reporting the ODDS of touching a target level within a horizon,
 * the likely range, and — among the paths that get there — a typical time.
 *
 * The boundary, enforced in code and prose: this is a probability derived from
 * history under LABELED assumptions, not a forecast of the actual rate and never
 * a date. Currencies are close to a random walk; a point/date prediction would be
 * false precision. Deterministic and seeded, so the probability is reproducible.
 * Pure and network-free — the caller supplies the series.
 */

import type { FxRate } from "./market-data-store.js";
import { mulberry32, normal } from "./monte-carlo.js";

// Below this many observations a drift/volatility estimate is too noisy to model
// honestly — refuse rather than project from a handful of points.
export const FORECAST_MIN_OBSERVATIONS = 20;

// ECB publishes ~252 business days a year; 21 ≈ one month of trading days.
const TRADING_DAYS_PER_YEAR = 252;
const TRADING_DAYS_PER_MONTH = 21;

const MAX_PATHS = 5000;
const MAX_MONTHS = 120;

export type FxForecastInputs = {
  target: number; // the rate level asked about (quote per 1 base)
  horizonMonths: number;
  paths?: number; // default 1000
  seed?: number; // default fixed, for reproducibility
};

export type FxForecast = {
  base: string;
  quote: string;
  target: number;
  horizonMonths: number;
  spot: number; // latest stored rate
  observations: number; // history points the estimate rests on
  annualDriftPct: number; // labeled assumption, from history
  annualVolPct: number; // labeled assumption, from history
  direction: "above" | "below" | "at"; // is the target above/below today's rate
  probReachPct: number; // odds of touching the target within the horizon
  p10: number; // range of where the rate lands at the horizon
  p50: number;
  p90: number;
  medianMonthsToReach: number | null; // among paths that reach, the middle first-touch month
  paths: number;
};

function stdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return Number(sorted[idx].toFixed(4));
}

/**
 * Project the odds a base→quote rate touches `target` within the horizon, from a
 * stored series. Returns null when there is too little history to estimate drift
 * and volatility honestly — the caller then refuses rather than inventing a
 * number. Deterministic: a fixed seed makes the probability reproducible.
 */
export function forecastFxLevel(
  base: string,
  quote: string,
  series: FxRate[],
  inputs: FxForecastInputs,
): FxForecast | null {
  const prices = series
    .filter((r) => typeof r.rate === "number" && Number.isFinite(r.rate) && r.rate > 0)
    .slice()
    .sort((a, b) => a.rate_date.localeCompare(b.rate_date))
    .map((r) => r.rate);

  if (prices.length < FORECAST_MIN_OBSERVATIONS) return null;

  // Daily log returns → drift (mean) and volatility (stdev) per trading day.
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const muDaily = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const sigmaDaily = stdev(logReturns, muDaily);

  const spot = prices[prices.length - 1];
  const target = inputs.target;
  if (!Number.isFinite(target) || target <= 0) return null;

  const direction: FxForecast["direction"] = target > spot ? "above" : target < spot ? "below" : "at";

  const paths = Math.min(MAX_PATHS, Math.max(100, Math.floor(inputs.paths ?? 1000)));
  const months = Math.min(MAX_MONTHS, Math.max(1, Math.floor(inputs.horizonMonths)));
  const days = months * TRADING_DAYS_PER_MONTH;
  const rand = mulberry32(inputs.seed ?? 0x1f2e3d4c);

  const finals: number[] = new Array(paths);
  const reachDays: number[] = [];
  let hits = 0;

  for (let p = 0; p < paths; p += 1) {
    let price = spot;
    let reachedOn = -1;
    // An "at"/already-past target counts as reached at day 0.
    if ((direction === "above" && price >= target) || (direction === "below" && price <= target) || direction === "at") {
      reachedOn = 0;
    }
    for (let d = 1; d <= days; d += 1) {
      // Next log-price step ~ Normal(muDaily, sigmaDaily): drift already included.
      price = price * Math.exp(muDaily + sigmaDaily * normal(rand));
      if (!Number.isFinite(price) || price <= 0) {
        price = Number.MIN_VALUE;
        break;
      }
      if (reachedOn < 0 && ((direction === "above" && price >= target) || (direction === "below" && price <= target))) {
        reachedOn = d;
      }
    }
    finals[p] = price;
    if (reachedOn >= 0) {
      hits += 1;
      reachDays.push(reachedOn);
    }
  }

  finals.sort((a, b) => a - b);
  reachDays.sort((a, b) => a - b);

  // A middle time-to-reach is only meaningful when a fair share of paths get
  // there; below that it's a handful of tail draws and would mislead.
  const medianMonthsToReach =
    reachDays.length >= Math.max(30, paths * 0.05)
      ? Number((reachDays[Math.floor(reachDays.length / 2)] / TRADING_DAYS_PER_MONTH).toFixed(1))
      : null;

  return {
    base,
    quote,
    target: Number(target.toFixed(4)),
    horizonMonths: months,
    spot: Number(spot.toFixed(4)),
    observations: prices.length,
    annualDriftPct: Number((muDaily * TRADING_DAYS_PER_YEAR * 100).toFixed(2)),
    annualVolPct: Number((sigmaDaily * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100).toFixed(2)),
    direction,
    probReachPct: Number(((hits / paths) * 100).toFixed(1)),
    p10: percentile(finals, 10),
    p50: percentile(finals, 50),
    p90: percentile(finals, 90),
    medianMonthsToReach,
    paths,
  };
}

function fmtRate(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 1 : 4 });
}

const FORECAST_DISCLAIMER =
  "_This is a probability derived from the stored history under labeled drift/volatility assumptions — **not** a forecast of the actual rate, and **not** a date. Exchange rates behave close to a random walk; even professionals can't reliably call the level or the timing. Capital and rates move._";

/** Render the projection as grounded prose — odds and a range, never a date. */
export function formatFxForecast(f: FxForecast): string {
  const pair = `${f.base}/${f.quote}`;
  if (f.direction === "at") {
    return [
      `**${pair} is already at about ${fmtRate(f.target)}** (latest stored rate ${fmtRate(f.spot)}).`,
      "",
      FORECAST_DISCLAIMER,
    ].join("\n");
  }

  const dirWord = f.direction === "above" ? "rise to" : "fall to";
  const reachLine =
    f.medianMonthsToReach !== null
      ? ` Among the runs that get there, the middle one first touches it around **month ${f.medianMonthsToReach}**.`
      : " Too few runs reach it to put a meaningful time on it.";

  return [
    `**Odds ${f.base}/${f.quote} ${dirWord} ${fmtRate(f.target)} within ${f.horizonMonths} months: ~${f.probReachPct}%.**`,
    "",
    `Today's stored rate is **${fmtRate(f.spot)}**. Across ${f.paths.toLocaleString("en-US")} simulated paths — calibrated to the last ${f.observations} daily observations (drift **${f.annualDriftPct}%/yr**, volatility **${f.annualVolPct}%/yr**) — the rate a year-equivalent out lands mostly between **${fmtRate(f.p10)}** (bottom 10%) and **${fmtRate(f.p90)}** (top 10%), with a middle of **${fmtRate(f.p50)}**.${reachLine}`,
    "",
    `I won't tell you **when** — that's not knowable — only how likely, and the range around it.`,
    "",
    FORECAST_DISCLAIMER,
  ].join("\n");
}
