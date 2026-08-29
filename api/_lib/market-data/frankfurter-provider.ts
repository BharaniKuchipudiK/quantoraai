/**
 * FX rates from the ECB via Frankfurter (https://frankfurter.dev) — free, no
 * key, and safe to use and display (ECB reference rates are public). Published
 * on TARGET business days around 16:00 CET.
 *
 * Pulls a rolling time-series window (one request per base) so `fx_rates` holds
 * daily history, not just today's snapshot — the foundation the historical FX
 * analytics turn reads back. Every daily run re-pulls the same window; the
 * upsert on (base, quote, rate_date) makes that idempotent, so history builds
 * on the first run and stays fresh thereafter.
 *
 * Normalizes into fx_rates rows carrying `source` and `as_of` so the Finance
 * turn can cite each rate's date and refuse a stale one.
 */

import type { FxRate } from "../market-data-store.js";
import type { MarketDataProvider, ProviderFetch } from "./provider.js";

const BASE_ENDPOINT = "https://api.frankfurter.app";
const FETCH_TIMEOUT_MS = 8_000;

// One year of daily history — enough for trend/volatility analytics — while a
// single time-series request per base keeps the call count tiny.
const DEFAULT_WINDOW_DAYS = 365;

/*
 * A live lookup sits in front of a user waiting for an answer, not in a nightly
 * job, so it gets a much shorter leash. Missing the deadline is not a failure
 * here — the stored rate is still behind it.
 */
const LIVE_TIMEOUT_MS = 2_500;

const CURRENCY_CODE = /^[A-Z]{3}$/;

// Kept small and explicit — a handful of daily requests, well within any limit.
export const DEFAULT_BASES = ["USD", "SGD", "EUR"];
export const DEFAULT_QUOTES = ["USD", "EUR", "GBP", "SGD", "INR", "JPY", "AUD", "CAD", "CHF", "HKD", "CNY"];

/*
 * The two endpoints return different shapes and both are still in use. The
 * ingestion path pulls a time-series; the live lookup pulls a single day. The
 * historical work replaced this type rather than adding beside it, which git
 * merged without complaint because the live path arrived in a different hunk.
 */
// Frankfurter /latest: { base, date, rates: { SGD: n, ... } }
type FrankfurterResponse = {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

// Frankfurter time-series: { base, start_date, end_date, rates: { "YYYY-MM-DD": { SGD: n, ... } } }
type FrankfurterTimeSeries = {
  base?: string;
  start_date?: string;
  end_date?: string;
  rates?: Record<string, Record<string, number>>;
};

function asOfFor(date: string): string {
  // ECB reference rates are effective for `date`; ~16:00 CET is a fair as-of.
  return `${date}T16:00:00Z`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchBase(
  base: string,
  quotes: string[],
  start: string,
  end: string,
): Promise<FxRate[]> {
  const symbols = quotes.filter((q) => q !== base);
  if (!symbols.length) return [];
  const url =
    `${BASE_ENDPOINT}/${start}..${end}` +
    `?from=${encodeURIComponent(base)}&to=${encodeURIComponent(symbols.join(","))}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Frankfurter ${base} -> ${response.status}`);
  const data = (await response.json()) as FrankfurterTimeSeries;
  const byDate = data.rates || {};
  const dates = Object.keys(byDate);
  // An HTTP 200 with no dated rates is an unusable response (e.g. an upstream
  // format change). Fail loudly so stored FX does not silently stop advancing
  // and go stale while the run still reports success.
  if (!dates.length) {
    throw new Error(`Frankfurter ${base}: response had no usable rates`);
  }
  const rows: FxRate[] = [];
  for (const date of dates) {
    const asOf = asOfFor(date);
    for (const [quote, rate] of Object.entries(byDate[date] || {})) {
      if (typeof rate === "number" && Number.isFinite(rate)) {
        rows.push({
          base_currency: base,
          quote_currency: quote,
          rate_date: date,
          rate,
          source: "ecb",
          as_of: asOf,
        });
      }
    }
  }
  if (!rows.length) throw new Error(`Frankfurter ${base}: response had no usable rates`);
  return rows;
}

/**
 * One rate, fetched live, for a person who just asked for it.
 *
 * WHY THIS EXISTS
 *
 * FX conversion used to be answerable ONLY from the Supabase table that the
 * Market Data Ingestion workflow fills. That workflow has never run on a
 * schedule — the `schedule:` block is commented out — so the stored rate ages
 * past the four-day staleness window and the Finance desk starts refusing
 * every conversion until somebody remembers to click "Run workflow". It is a
 * feature that breaks every four days by construction.
 *
 * This gives conversion a second, independent path. Frankfurter is free and
 * needs no key, and it serves the SAME ECB reference rates the ingestion pulls,
 * so the live answer and the stored one cannot disagree about what a rate is —
 * only about how recent it is. Conversion now works if EITHER path works.
 *
 * Returns null on every failure rather than throwing. A live-path problem must
 * never take down a turn the store could still answer.
 */
export async function liveFxRate(
  base: string,
  quote: string,
  { fetchFn = fetch, timeoutMs = LIVE_TIMEOUT_MS }: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<FxRate | null> {
  const from = String(base || "").trim().toUpperCase();
  const to = String(quote || "").trim().toUpperCase();
  // Validated rather than merely escaped: these are interpolated into a URL,
  // and a strict shape is cheaper to reason about than an encoding argument.
  if (!CURRENCY_CODE.test(from) || !CURRENCY_CODE.test(to) || from === to) return null;

  try {
    /*
     * BASE_ENDPOINT, not ENDPOINT. The historical-analytics work renamed the
     * constant and dropped "/latest" from it so the time-series path could be
     * appended; the live lookup landed separately and still referenced the old
     * name. Git merged both cleanly because they sit in different hunks — the
     * break exists only in the combination, which is why it needed a typecheck
     * of the merge rather than a review of either side.
     */
    const response = await fetchFn(`${BASE_ENDPOINT}/latest?from=${from}&to=${to}`, {
      signal: AbortSignal.timeout(timeoutMs),
    } as any);
    if (!response.ok) return null;
    const data = (await response.json()) as FrankfurterResponse;
    const date = data?.date;
    const rate = data?.rates?.[to];
    // Same contract as the ingestion path: an HTTP 200 carrying no usable rate
    // is not an answer, and must not be dressed up as one.
    if (!date || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    return {
      base_currency: from,
      quote_currency: to,
      rate_date: date,
      rate,
      source: "ecb",
      as_of: asOfFor(date),
    };
  } catch {
    return null;
  }
}

export function frankfurterProvider(
  bases: string[] = DEFAULT_BASES,
  quotes: string[] = DEFAULT_QUOTES,
  windowDays: number = DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): MarketDataProvider {
  return {
    id: "frankfurter-fx",
    label: "ECB FX (Frankfurter)",
    async fetch(): Promise<ProviderFetch> {
      const end = isoDate(now);
      const startDate = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const start = isoDate(startDate);
      const fxRates: FxRate[] = [];
      const errors: string[] = [];
      for (const base of bases) {
        try {
          fxRates.push(...(await fetchBase(base, quotes, start, end)));
        } catch (err: any) {
          errors.push(err?.message || String(err));
        }
      }
      // Partial success is fine; only a total wipeout is a provider failure.
      if (!fxRates.length && errors.length) throw new Error(errors.join("; "));
      return { fxRates };
    },
  };
}
