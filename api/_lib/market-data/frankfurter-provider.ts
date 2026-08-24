/**
 * FX rates from the ECB via Frankfurter (https://frankfurter.dev) — free, no
 * key, and safe to use and display (ECB reference rates are public). Published
 * on TARGET business days around 16:00 CET.
 *
 * Normalizes into fx_rates rows carrying `source` and `as_of` so the Finance
 * turn can cite the rate's date and refuse a stale one.
 */

import type { FxRate } from "../market-data-store.js";
import type { MarketDataProvider, ProviderFetch } from "./provider.js";

const ENDPOINT = "https://api.frankfurter.app/latest";
const FETCH_TIMEOUT_MS = 8_000;

// Kept small and explicit — a handful of daily requests, well within any limit.
export const DEFAULT_BASES = ["USD", "SGD", "EUR"];
export const DEFAULT_QUOTES = ["USD", "EUR", "GBP", "SGD", "INR", "JPY", "AUD", "CAD", "CHF", "HKD", "CNY"];

type FrankfurterResponse = {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

function asOfFor(date: string): string {
  // ECB reference rates are effective for `date`; ~16:00 CET is a fair as-of.
  return `${date}T16:00:00Z`;
}

async function fetchBase(base: string, quotes: string[]): Promise<FxRate[]> {
  const symbols = quotes.filter((q) => q !== base);
  if (!symbols.length) return [];
  const url = `${ENDPOINT}?from=${encodeURIComponent(base)}&to=${encodeURIComponent(symbols.join(","))}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Frankfurter ${base} -> ${response.status}`);
  const data = (await response.json()) as FrankfurterResponse;
  const date = data.date;
  const rates = data.rates || {};
  // We asked for symbols; an HTTP 200 with no date or no rates is an unusable
  // response (e.g. an upstream format change). Fail loudly so stored FX does not
  // silently stop advancing and go stale while the run still reports success.
  if (!date || !Object.keys(rates).length) {
    throw new Error(`Frankfurter ${base}: response had no usable rates`);
  }
  const asOf = asOfFor(date);
  return Object.entries(rates)
    .filter(([, rate]) => typeof rate === "number" && Number.isFinite(rate))
    .map(([quote, rate]) => ({
      base_currency: base,
      quote_currency: quote,
      rate_date: date,
      rate,
      source: "ecb",
      as_of: asOf,
    }));
}

export function frankfurterProvider(
  bases: string[] = DEFAULT_BASES,
  quotes: string[] = DEFAULT_QUOTES,
): MarketDataProvider {
  return {
    id: "frankfurter-fx",
    label: "ECB FX (Frankfurter)",
    async fetch(): Promise<ProviderFetch> {
      const fxRates: FxRate[] = [];
      const errors: string[] = [];
      for (const base of bases) {
        try {
          fxRates.push(...(await fetchBase(base, quotes)));
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
