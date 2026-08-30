/**
 * Historical FX analytics (ADR-025) — the honest, deterministic engine behind
 * the Finance "how has X performed?" turn.
 *
 * It DESCRIBES a stored ECB series — period change, high/low, average,
 * volatility, and a plain-language trend — from real, sourced rows. It never
 * forecasts: no "will", no target, no projection. Prediction of a future price
 * is refused upstream (the gateway) and has no code path here. Pure and
 * network-free so it is fully unit-testable, mirroring debt-payoff/savings-goal.
 */

import type { FxRate } from "./market-data-store.js";
import type { FxAnalyticsIntent } from "./fx-analytics-intent.js";

// Below this, a mean/volatility/trend read is not meaningful — refuse rather
// than dress up a couple of points as an analysis.
export const MIN_OBSERVATIONS = 5;

// ECB publishes ~252 business days a year; used to annualize daily volatility.
const TRADING_DAYS_PER_YEAR = 252;

export type FxPoint = { date: string; rate: number };

export type FxAnalytics = {
  base: string;
  quote: string;
  observations: number;
  first: FxPoint;
  last: FxPoint;
  changePct: number;
  high: FxPoint;
  low: FxPoint;
  mean: number;
  dailyVolPct: number;
  annualizedVolPct: number;
  trend: "strengthened" | "weakened" | "roughly flat";
  source: string;
  latestAsOf: string;
};

function trendOf(changePct: number): FxAnalytics["trend"] {
  // "Strengthened/weakened" describes the BASE against the quote: a higher
  // base→quote rate means one base unit buys more quote, i.e. the base is stronger.
  if (changePct > 1) return "strengthened";
  if (changePct < -1) return "weakened";
  return "roughly flat";
}

/**
 * Compute descriptive stats from a stored FX series (oldest first). Returns null
 * when there are too few real observations to analyze — the caller then refuses
 * honestly rather than guessing.
 */
export function computeFxAnalytics(base: string, quote: string, series: FxRate[]): FxAnalytics | null {
  const points: FxPoint[] = (series || [])
    .filter((r) => typeof r?.rate === "number" && Number.isFinite(r.rate) && r.rate > 0 && r.rate_date)
    .map((r) => ({ date: r.rate_date, rate: r.rate }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < MIN_OBSERVATIONS) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const changePct = ((last.rate - first.rate) / first.rate) * 100;

  let high = points[0];
  let low = points[0];
  let sum = 0;
  for (const p of points) {
    if (p.rate > high.rate) high = p;
    if (p.rate < low.rate) low = p;
    sum += p.rate;
  }
  const mean = sum / points.length;

  // Daily simple returns → population stdev → annualized. Volatility, not a forecast.
  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    returns.push((points[i].rate - points[i - 1].rate) / points[i - 1].rate);
  }
  let dailyVol = 0;
  if (returns.length > 0) {
    const rMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - rMean) ** 2, 0) / returns.length;
    dailyVol = Math.sqrt(variance);
  }

  const latest = (series || []).reduce<FxRate | null>((acc, r) => {
    if (!r?.rate_date) return acc;
    if (!acc || r.rate_date > acc.rate_date) return r;
    return acc;
  }, null);

  return {
    base,
    quote,
    observations: points.length,
    first,
    last,
    changePct,
    high,
    low,
    mean,
    dailyVolPct: dailyVol * 100,
    annualizedVolPct: dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
    trend: trendOf(changePct),
    source: latest?.source || series[0]?.source || "ecb",
    latestAsOf: latest?.as_of || series[series.length - 1]?.as_of || "",
  };
}

function fmt(n: number, dp = 4): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function sourceLabel(source: string): string {
  return source === "ecb" ? "ECB (Frankfurter)" : source;
}

export type FxAnalyticsResult = { text: string; resolved: boolean };

/**
 * Decision + formatting for the analytics turn. Describes the stored series and
 * is explicit that this is history, not a prediction. When too little data is
 * stored it refuses honestly instead of inventing a trend.
 */
export function fxAnalyticsResult(intent: FxAnalyticsIntent, series: FxRate[]): FxAnalyticsResult {
  const { base, quote } = intent;
  const a = computeFxAnalytics(base, quote, series);

  if (!a) {
    return {
      resolved: false,
      text:
        `I don't have enough stored **${base}→${quote}** history to analyse yet — Quantora only measures a series it holds from the ECB feed, and won't fabricate one. ` +
        `I can still give you the current rate; the trend needs more days of history than I have.`,
    };
  }

  const dir = a.changePct >= 0 ? "+" : "";
  const lines = [
    `**${base}→${quote} — historical performance** (${a.first.date} → ${a.last.date}, ${a.observations} ECB business days)`,
    "",
    `- **Change over period:** ${dir}${a.changePct.toFixed(2)}% — the ${base} ${a.trend} vs the ${quote} (${fmt(a.first.rate)} → ${fmt(a.last.rate)})`,
    `- **Range:** low ${fmt(a.low.rate)} on ${a.low.date} · high ${fmt(a.high.rate)} on ${a.high.date}`,
    `- **Average:** ${fmt(a.mean)}`,
    `- **Volatility:** ${a.dailyVolPct.toFixed(2)}% daily (≈ ${a.annualizedVolPct.toFixed(1)}% annualized)`,
    "",
    `_As of ${a.latestAsOf.slice(0, 10) || a.last.date} · source: ${sourceLabel(a.source)}. This describes stored, sourced history — it is **not** a forecast, and I won't predict a future rate._`,
  ];
  return { resolved: true, text: lines.join("\n") };
}
