import assert from "node:assert/strict";
import test from "node:test";

import {
  rangePosition,
  annualisedVolatility,
  rollingReturnBaseRates,
  sparklineBlocks,
  rangeBar,
  stagedEntryComparison,
  buildSignalRead,
  isSignalEmpty,
  formatSignalRead,
} from "./equity-signal.js";
import type { PriceBar } from "./market-data-store.js";

/** A synthetic daily series; `shape` maps a 0..1 progress to a close. */
function series(count: number, shape: (t: number, i: number) => number): PriceBar[] {
  const start = Date.UTC(2020, 0, 1);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(start + i * 86_400_000).toISOString();
    return {
      instrument_id: "TEST.US",
      price_date: day.slice(0, 10),
      open: null, high: null, low: null,
      close: shape(i / Math.max(1, count - 1), i),
      adj_close: null, volume: null,
      currency: "USD", source: "stooq", as_of: day,
    };
  });
}

const flatish = (n: number) => series(n, () => 100);
/** Deterministic wobble around a rising trend — no PRNG, so tests never flake. */
const trending = (n: number) => series(n, (_, i) => 100 + i * 0.2 + Math.sin(i / 7) * 4);

test("range position places the latest price inside the period band", () => {
  const bars = series(300, (_, i) => 100 + i * 0.5); // 100 -> ~249.5
  const r = rangePosition(bars, 200)!;
  assert.ok(r, "expected a range");
  assert.equal(r.low, 100);
  assert.ok(r.high >= 249 && r.high <= 250, `high was ${r.high}`);
  // 200 sits about two-thirds up a 100..249.5 band.
  assert.ok(r.positionPct > 60 && r.positionPct < 72, `position was ${r.positionPct}`);
  assert.equal(r.bars, 300);
});

/*
 * A live price can legitimately sit above every stored close (a fresh high) or
 * below every one. Clamping would draw "exactly at the high" for a price well
 * beyond it — a marker that quietly lies. The band widens instead.
 */
test("range widens to include a live price outside the stored series", () => {
  const bars = series(300, () => 100);
  const above = rangePosition(bars, 130)!;
  assert.equal(above.high, 130);
  assert.equal(above.positionPct, 100);

  const below = rangePosition(bars, 80)!;
  assert.equal(below.low, 80);
  assert.equal(below.positionPct, 0);
});

test("range refuses a series too short to describe a band", () => {
  assert.equal(rangePosition(series(20, () => 100), 100), null);
  assert.equal(rangePosition([], 100), null);
});

test("range refuses an unusable latest price", () => {
  assert.equal(rangePosition(series(300, (_, i) => 100 + i), 0), null);
  assert.equal(rangePosition(series(300, (_, i) => 100 + i), Number.NaN), null);
});

test("volatility is zero for a flat series and positive for a moving one", () => {
  assert.equal(annualisedVolatility(flatish(200)), 0);
  const vol = annualisedVolatility(trending(400))!;
  assert.ok(vol > 0, `expected positive volatility, got ${vol}`);
});

test("volatility refuses a series too short to estimate from", () => {
  assert.equal(annualisedVolatility(series(10, () => 100)), null);
});

/*
 * The headline block: how often did this ACTUALLY clear the bar. It is
 * arithmetic over what happened, never a projection — a series that always
 * gained 20% over a year must report a 100% hit rate against a 10% bar.
 */
test("base rates count rolling windows that cleared the threshold", () => {
  // +20% per 252 trading days, compounding daily.
  const daily = Math.pow(1.2, 1 / 252);
  const bars = series(800, (_, i) => 100 * Math.pow(daily, i));
  const rates = rollingReturnBaseRates(bars, 10)!;
  assert.ok(rates, "expected base rates");
  assert.equal(rates.hitRatePct, 100, "every window should clear a 10% bar");
  assert.ok(rates.medianPct > 19 && rates.medianPct < 21, `median was ${rates.medianPct}`);
  assert.equal(rates.windows, 800 - 252);
});

test("base rates report a zero hit rate when nothing cleared the bar", () => {
  const rates = rollingReturnBaseRates(flatish(700), 10)!;
  assert.equal(rates.hitRatePct, 0);
  assert.equal(rates.medianPct, 0);
  assert.equal(rates.worstPct, 0);
});

test("base rates surface the worst window, not just the good news", () => {
  // Rises, then gives it all back — some windows must be deeply negative.
  const bars = series(800, (_, i) => (i < 400 ? 100 + i * 0.5 : 300 - (i - 400) * 0.5));
  const rates = rollingReturnBaseRates(bars, 10)!;
  assert.ok(rates.worstPct < -20, `worst was ${rates.worstPct}`);
  assert.ok(rates.bestPct > 20, `best was ${rates.bestPct}`);
});

/*
 * One year of history yields no completed 12-month windows. Reporting a base
 * rate from that would be a number invented out of an absence — exactly what
 * this desk refuses to do everywhere else.
 */
test("base rates refuse a series with too few completed windows", () => {
  assert.equal(rollingReturnBaseRates(series(252, () => 100), 10), null);
  assert.equal(rollingReturnBaseRates(series(280, () => 100), 10), null);
});

test("sparkline renders one block per sample, rising to full height at the end", () => {
  const spark = sparklineBlocks(series(300, (_, i) => 100 + i), 28)!;
  assert.equal(spark.length, 28, "one character per sample");
  assert.equal(spark[spark.length - 1], "\u2588", "a rising series ends at the tallest block");
  assert.equal(spark[0], "\u2581", "and starts at the shortest");
});

test("sparkline returns null for a flat series rather than drawing a claim", () => {
  assert.equal(sparklineBlocks(flatish(300)), null);
  assert.equal(sparklineBlocks(series(10, (_, i) => 100 + i)), null);
});

/*
 * The wordless block: a marker on a band. It must land at the ends for 0 and
 * 100, because "at the low" and "at the high" are exactly the readings someone
 * acts on.
 */
test("range bar puts the marker where the position says", () => {
  const lo = rangeBar(0, 11);
  const hi = rangeBar(100, 11);
  const mid = rangeBar(50, 11);
  assert.equal(lo.indexOf("\u25cf"), 0, "0% sits at the left end");
  assert.equal(hi.indexOf("\u25cf"), 10, "100% sits at the right end");
  assert.equal(mid.indexOf("\u25cf"), 5, "50% sits in the middle");
  for (const bar of [lo, hi, mid]) assert.equal(bar.length, 11, "bar keeps its width");
});

test("range bar clamps a position outside 0..100 onto the bar", () => {
  assert.equal(rangeBar(-40, 11).indexOf("\u25cf"), 0);
  assert.equal(rangeBar(180, 11).indexOf("\u25cf"), 10);
});

/*
 * Graceful degradation is the contract: a thin history produces a smaller
 * card, never a confident figure computed from nothing.
 */
test("a thin series yields an empty read instead of invented blocks", () => {
  const read = buildSignalRead("TEST", series(15, (_, i) => 100 + i), 110);
  assert.equal(read.range, null);
  assert.equal(read.annualisedVolPct, null);
  assert.equal(read.baseRates, null);
  assert.equal(read.spark, null);
  assert.equal(isSignalEmpty(read), true);
});

test("a full series fills every block", () => {
  const read = buildSignalRead("TEST", trending(800), 240);
  assert.ok(read.range, "range");
  assert.ok(read.annualisedVolPct !== null, "volatility");
  assert.ok(read.baseRates, "base rates");
  assert.ok(read.spark, "sparkline");
  assert.equal(isSignalEmpty(read), false);
  assert.equal(read.symbol, "TEST");
});

test("bars with unusable closes are dropped, not treated as zero", () => {
  const bars = trending(400);
  bars[10].close = null;
  bars[20].close = Number.NaN as unknown as number;
  const read = buildSignalRead("TEST", bars, 150);
  assert.ok(read.range!.low > 0, "a null close must not drag the low to zero");
});

/*
 * A label that doesn't match the data under it is the same defect as a stale
 * price badged "live". The card says "52-week range" and "Last 52 weeks", so
 * both blocks must be drawn from the last year — while the base rates keep the
 * FULL history, because counting rolling 12-month windows is exactly what
 * needs the extra years.
 */
test("range and sparkline use the last year; base rates use all of it", () => {
  const fiveYears = series(1400, (_, i) => 100 + i * 0.15);
  const read = buildSignalRead("TEST", fiveYears, 310);

  assert.ok(read.range!.periodDays <= 252, `range covered ${read.range!.periodDays} days`);
  // The last 252 bars of a rising series start well above the series low of 100.
  assert.ok(read.range!.low > 150, `range low ${read.range!.low} leaked older history`);
  assert.ok(read.baseRates!.windows > 1000, "base rates must still see the whole series");
  assert.ok(read.baseRates!.yearsCovered > 4, "base rates must report multi-year coverage");
});

test("a short series labels the range by what it actually covers", () => {
  const read = buildSignalRead("TEST", series(120, (_, i) => 100 + i), 220);
  assert.ok(read.range, "expected a range from 120 bars");
  assert.ok(read.range!.periodDays < 240, "must not claim a 52-week band from 120 bars");
});

/*
 * Codex, on #385: the card asserted that staging entry "costs a little of the
 * median and meaningfully narrows the bad case" while computing nothing. That
 * is the received wisdom about dollar-cost averaging presented as though it
 * followed from the calculation. It is now derived, and these pin the two
 * directions it can fall.
 */
test("staged entry costs median on a steadily rising series", () => {
  // Rising every day: buying later always costs you. Lump sum must win.
  const rising = series(900, (_, i) => 100 * Math.pow(1.0008, i));
  const cmp = stagedEntryComparison(rising, 3)!;
  assert.ok(cmp, "expected a comparison");
  assert.ok(cmp.lumpMedianPct > cmp.stagedMedianPct,
    `lump ${cmp.lumpMedianPct} should beat staged ${cmp.stagedMedianPct} on a rising series`);
  assert.equal(cmp.tranches, 3);
});

test("staged entry beats lump sum on a steadily falling series", () => {
  // Falling every day: buying later is always cheaper.
  const falling = series(900, (_, i) => 300 * Math.pow(0.9992, i));
  const cmp = stagedEntryComparison(falling, 3)!;
  assert.ok(cmp.stagedMedianPct > cmp.lumpMedianPct,
    `staged ${cmp.stagedMedianPct} should beat lump ${cmp.lumpMedianPct} on a falling series`);
});

test("staged entry refuses a series too short to compare", () => {
  assert.equal(stagedEntryComparison(series(260, (_, i) => 100 + i), 3), null);
  assert.equal(stagedEntryComparison(series(900, () => 100), 1), null, "needs at least two tranches");
});

test("the view reports the staging numbers it computed, never a stock phrase", () => {
  const rising = series(900, (_, i) => 100 * Math.pow(1.0008, i));
  const read = buildSignalRead("TEST", rising, 200);
  const card = formatSignalRead(read, "**TEST — 200.00 USD** (live)");
  assert.match(card, /historical windows/, "the comparison must be shown");
  assert.match(card, /monthly buys/);
  // The old asserted phrasing must not survive anywhere.
  assert.doesNotMatch(card, /meaningfully narrows the bad case/);
  assert.ok(
    /staging did not rescue the bad case|staging is a real one here|staging entry looks worth it/.test(card),
    "the lean must follow the computed direction",
  );
});

test("without enough history the view says so instead of claiming a comparison", () => {
  const short = series(300, (_, i) => 100 + i * 0.2);
  const read = buildSignalRead("TEST", short, 155);
  assert.equal(read.stagedEntry, null);
  const card = formatSignalRead(read, "**TEST — 155.00 USD** (live)");
  assert.match(card, /won't pretend to/, "must admit the missing comparison");
});
