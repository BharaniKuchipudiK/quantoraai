/**
 * Signal Read analytics — the substance behind an investment question.
 *
 * Asking "when is the best time to invest in Apple?" used to reach the language
 * model and come back as a generic essay about dollar-cost averaging: correct,
 * unfalsifiable, and containing no fact about Apple. The platform had a live
 * price and a year of history sitting one call away and used neither.
 *
 * This module computes what an advisor would actually put in front of someone,
 * from a real price series:
 *
 *   - where today sits inside the 52-week range (the wordless answer to
 *     "is this cheap or dear right now")
 *   - annualised volatility, so the spread being signed up for is stated
 *   - HISTORICAL BASE RATES: across every rolling 12-month window in the
 *     stored series, how often did this actually return the target? That is
 *     the honest answer to "when can I get 10% back" — it is arithmetic over
 *     what happened, not a forecast of what will.
 *   - a sparkline path, because shape recognition beats a paragraph describing
 *     a shape.
 *
 * EVERY block returns null when the series is too short to support it. A thin
 * history must produce a smaller card, never a confident number computed from
 * nothing — the failure this whole desk exists to prevent. Pure and
 * network-free, so all of it is testable without a feed.
 */

import type { PriceBar } from "./market-data-store.js";

/** US trading days in a year — the window length for a "12-month" return. */
const TRADING_DAYS_YEAR = 252;

/** Below these, an estimate is noise dressed as a figure. */
const MIN_BARS_FOR_RANGE = 40;
const MIN_BARS_FOR_VOLATILITY = 30;
/** Rolling windows overlap heavily, so a handful of them says almost nothing. */
const MIN_WINDOWS_FOR_BASE_RATES = 40;

export type RangePosition = {
  low: number;
  high: number;
  /** Trading days the band actually covers — the label must match the data. */
  periodDays: number;
  /** 0 = at the period low, 100 = at the period high. */
  positionPct: number;
  /** Bars the range was computed from — the caller states its own evidence. */
  bars: number;
};

export type BaseRates = {
  thresholdPct: number;
  /** Share of rolling windows that returned at least the threshold. */
  hitRatePct: number;
  medianPct: number;
  worstPct: number;
  bestPct: number;
  windows: number;
  /** Whole years the windows were drawn from, for an honest caption. */
  yearsCovered: number;
};

export type SignalRead = {
  symbol: string;
  range: RangePosition | null;
  annualisedVolPct: number | null;
  baseRates: BaseRates | null;
  spark: string | null;
};

/** Closing prices, oldest first, with unusable bars dropped. */
function closes(series: PriceBar[]): number[] {
  return (series || [])
    .map((bar) => (typeof bar?.close === "number" ? bar.close : Number.NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Where the latest price sits between the period's low and high.
 *
 * This is the block that answers "is now a good moment?" without a sentence —
 * a marker near the top of the bar says more, faster, than any paragraph.
 */
export function rangePosition(series: PriceBar[], latest: number): RangePosition | null {
  const prices = closes(series);
  if (prices.length < MIN_BARS_FOR_RANGE) return null;
  if (!Number.isFinite(latest) || latest <= 0) return null;

  // The live price can sit outside the stored range (a fresh high, or a stale
  // series). Widening to include it keeps the marker on the bar and honest:
  // clamping would draw "at the high" for a price well above it.
  const low = Math.min(...prices, latest);
  const high = Math.max(...prices, latest);
  if (!(high > low)) return null;

  return {
    low: Number(low.toFixed(2)),
    high: Number(high.toFixed(2)),
    periodDays: prices.length,
    positionPct: Number((((latest - low) / (high - low)) * 100).toFixed(1)),
    bars: prices.length,
  };
}

/**
 * Annualised volatility from daily log returns — the same calibration the FX
 * projection uses, so the two desks describe risk in one language.
 */
export function annualisedVolatility(series: PriceBar[]): number | null {
  const prices = closes(series);
  if (prices.length < MIN_BARS_FOR_VOLATILITY + 1) return null;

  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (logReturns.length - 1);
  const daily = Math.sqrt(Math.max(0, variance));
  return Number((daily * Math.sqrt(TRADING_DAYS_YEAR) * 100).toFixed(1));
}

/**
 * How often this actually cleared the bar, historically.
 *
 * Every rolling `windowDays`-length window in the series contributes one
 * return. The result is a count of what happened — deliberately NOT a
 * projection, and the caller must say so. Windows overlap, so this describes
 * the shape of the past rather than a sample of independent trials; that
 * caveat belongs in the copy, not hidden here.
 */
export function rollingReturnBaseRates(
  series: PriceBar[],
  thresholdPct = 10,
  windowDays = TRADING_DAYS_YEAR,
): BaseRates | null {
  const prices = closes(series);
  const span = Math.max(1, Math.floor(windowDays));
  const windows = prices.length - span;
  if (windows < MIN_WINDOWS_FOR_BASE_RATES) return null;

  const returns: number[] = [];
  for (let i = 0; i + span < prices.length; i += 1) {
    returns.push((prices[i + span] / prices[i] - 1) * 100);
  }
  const hits = returns.filter((r) => r >= thresholdPct).length;
  const sorted = [...returns].sort((a, b) => a - b);

  return {
    thresholdPct,
    hitRatePct: Number(((hits / returns.length) * 100).toFixed(0)),
    medianPct: Number(median(sorted).toFixed(1)),
    worstPct: Number(sorted[0].toFixed(1)),
    bestPct: Number(sorted[sorted.length - 1].toFixed(1)),
    windows: returns.length,
    yearsCovered: Number((prices.length / TRADING_DAYS_YEAR).toFixed(1)),
  };
}

/*
 * The two wordless blocks are rendered as MONOSPACE TEXT, not SVG.
 *
 * A picture would be prettier, but the deterministic desks stream markdown and
 * inline SVG support is not something to assume — a chart that silently fails
 * to render is worse than one made of characters that always does. Block
 * elements and box-drawing rules read the same everywhere, need no frontend
 * change, and still say it without a sentence. SVG is a later upgrade, once the
 * renderer is proven to carry it.
 */

const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";
const SPARK_WIDTH = 28;
const RANGE_BAR_WIDTH = 24;

/**
 * A block-character sparkline of the series, oldest character first.
 *
 * Returns null for a flat series rather than a row of identical blocks: a
 * straight line asserts "this did not move", which is a claim the caller has
 * not earned when the truth is closer to "there is nothing here to show".
 */
export function sparklineBlocks(series: PriceBar[], width = SPARK_WIDTH): string | null {
  const prices = closes(series);
  if (prices.length < MIN_BARS_FOR_RANGE) return null;

  const step = prices.length / width;
  const sampled = Array.from({ length: width }, (_, i) =>
    prices[Math.min(prices.length - 1, Math.floor(i * step))]);
  sampled[width - 1] = prices[prices.length - 1]; // always end on the latest close

  const lo = Math.min(...sampled);
  const hi = Math.max(...sampled);
  if (!(hi > lo)) return null;

  return sampled
    .map((price) => {
      const level = Math.round(((price - lo) / (hi - lo)) * (SPARK_BLOCKS.length - 1));
      return SPARK_BLOCKS[Math.min(SPARK_BLOCKS.length - 1, Math.max(0, level))];
    })
    .join("");
}

/**
 * The 52-week band with a marker where today sits — the block that answers
 * "cheap or dear right now" before a single word is read.
 */
export function rangeBar(positionPct: number, width = RANGE_BAR_WIDTH): string {
  const clamped = Math.min(100, Math.max(0, positionPct));
  const at = Math.round((clamped / 100) * (width - 1));
  return "─".repeat(at) + "●" + "─".repeat(width - 1 - at);
}

/**
 * Every block computed from one series. Any of them may be null.
 *
 * The range and the sparkline are drawn from the LAST YEAR of the series, not
 * all of it. They are labelled "52-week" and "twelve months", and a label that
 * does not match the data it sits under is the same defect as a stale price
 * badged live — the base rates deliberately keep the full history, because
 * counting rolling 12-month windows is exactly what needs the extra years.
 */
export function buildSignalRead(
  symbol: string,
  series: PriceBar[],
  latest: number,
  thresholdPct = 10,
): SignalRead {
  const recent = series.slice(-TRADING_DAYS_YEAR);
  return {
    symbol,
    range: rangePosition(recent, latest),
    annualisedVolPct: annualisedVolatility(recent),
    baseRates: rollingReturnBaseRates(series, thresholdPct),
    spark: sparklineBlocks(recent),
  };
}

/** True when nothing beyond the bare price could be computed. */
export function isSignalEmpty(read: SignalRead): boolean {
  return !read.range && read.annualisedVolPct === null && !read.baseRates && !read.spark;
}

/*
 * The card copy.
 *
 * Deliberately DETERMINISTIC rather than model-written. Every sentence below is
 * selected by a computed number, so the view cannot drift, cannot flatter, and
 * cannot invent a figure — the same guarantee the rest of the desk gives. It
 * states a lean and names what would change it, then asks ONE question and
 * stops, which is the discipline the Study tutor already proved.
 */

/** Describes the band by the data behind it, never by a period we assumed. */
function rangeLabel(periodDays: number): string {
  if (periodDays >= 240) return "52-week range";
  const months = Math.max(1, Math.round(periodDays / 21));
  return `${months}-month range`;
}

function pct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** Where in the band today sits, in words, for the line under the bar. */
function bandPhrase(positionPct: number): string {
  if (positionPct >= 80) return "near the top of its range";
  if (positionPct >= 60) return "in the upper half of its range";
  if (positionPct <= 20) return "near the bottom of its range";
  if (positionPct <= 40) return "in the lower half of its range";
  return "around the middle of its range";
}

/**
 * The lean. Timing is almost never the lever people think it is, and saying so
 * with the numbers behind it is the most useful thing an advisor can do with
 * this question — but it is only true at length, so the horizon caveat is part
 * of the claim rather than a footnote.
 */
function theView(read: SignalRead): string {
  const lines: string[] = [];

  if (read.range) {
    lines.push(`Today sits **${bandPhrase(read.range.positionPct)}** — that is a fact about price, not a signal to act on.`);
  }

  if (read.annualisedVolPct !== null && read.annualisedVolPct > 0) {
    lines.push(
      `At **${read.annualisedVolPct}%** annualised volatility, roughly a **1-in-6** chance of sitting about that much lower a year from now. `
      + "That is the spread you would be living with.",
    );
  }

  lines.push(
    "**My lean: timing is not your lever here.** Over a five-year horizon the *month* you enter explains "
    + "little of your outcome; how much you put in, and how regularly, explains most of it. If regret is "
    + "what you are managing, spreading entry over three to six months costs a little of the median and "
    + "meaningfully narrows the bad case.",
  );

  lines.push(
    "**What would change this:** a horizon under three years, or money you might need back early. "
    + "Then entry timing starts to matter, and so does not being in a single company at all.",
  );

  return lines.join("\n\n");
}

/**
 * Renders the read as the card. `priceLine` is produced by the price desk so
 * freshness is described in exactly one place.
 */
export function formatSignalRead(read: SignalRead, priceLine: string, companyName?: string): string {
  const name = companyName ? ` · ${companyName}` : "";
  const out: string[] = [priceLine];

  if (read.range) {
    out.push(
      "```\n"
      + `${read.range.low.toFixed(2)}  ${rangeBar(read.range.positionPct)}  ${read.range.high.toFixed(2)}\n`
      + "```\n"
      + `_${rangeLabel(read.range.periodDays)}${name} — the marker is today._`,
    );
  }

  if (read.spark) {
    const period = read.range
      ? `Last ${rangeLabel(read.range.periodDays).replace("-", " ").replace(" range", "")}`
      : "Recent history";
    out.push("```\n" + read.spark + "\n```\n_" + period + ", oldest to newest._");
  }

  if (read.baseRates) {
    const b = read.baseRates;
    out.push(
      `**Returned ${b.thresholdPct}% or more over 12 months in ${b.hitRatePct}% of rolling windows.**\n\n`
      + `Median ${pct(b.medianPct)} · worst ${pct(b.worstPct)} · best ${pct(b.bestPct)}\n\n`
      + `_Counted across ${b.windows} overlapping 12-month windows from ${b.yearsCovered} years of history. `
      + "This is what happened, not a forecast — and overlapping windows describe the shape of the past "
      + "rather than independent trials._",
    );
  }

  out.push(theView(read));
  out.push("I'm not a licensed adviser and I won't tell you to buy on a given day.");
  return out.join("\n\n");
}

/** What to say when the price is all we could compute. */
export function formatSignalUnavailable(symbol: string, priceLine: string): string {
  return `${priceLine}\n\n`
    + `That's the price, but I couldn't pull enough history for **${symbol}** to say anything useful about `
    + "its range, its volatility, or how often it has actually returned what you're asking about — and I "
    + "won't estimate those from nothing.\n\n"
    + "The price above is real and sourced. The rest of the read needs the daily history feed, which isn't "
    + "answering right now.";
}
