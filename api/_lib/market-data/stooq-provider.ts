/**
 * Stock prices from Stooq (https://stooq.com) — free, keyless, end-of-day. It
 * fills the equity-quote gap the same way Frankfurter fills FX: a LIVE latest
 * quote for "how much is TSLA?" and a rolling daily history so the projection
 * engine can model any ticker, not just currencies.
 *
 * Honest boundary: this is END-OF-DAY (or last-close) data, not a live tick. The
 * caller labels it as a close and refuses a stale one — never dressing an old
 * bar up as the current price. Pure and network-injectable (fetch is a param),
 * so it stays trivially testable without the network.
 */

import type { PriceBar } from "../market-data-store.js";
import type { MarketDataProvider, ProviderFetch } from "./provider.js";

const LATEST_ENDPOINT = "https://stooq.com/q/l/";
const HISTORY_ENDPOINT = "https://stooq.com/q/d/l/";
const FETCH_TIMEOUT_MS = 8_000;
// A live lookup sits in front of a waiting user, so it gets a short leash.
const LIVE_TIMEOUT_MS = 2_500;
const DEFAULT_WINDOW_DAYS = 365;

// A small, explicit default universe — a handful of daily requests, well within
// any limit. The reference set the app quotes without a paid feed.
export const DEFAULT_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX", "AMD", "INTC",
];

// Only plausible tickers reach the network — 1–6 letters, optional dot-suffix.
const TICKER = /^[A-Za-z]{1,6}(?:\.[A-Za-z]{1,3})?$/;

/** Our instrument id for a US symbol, matching the reference universe convention. */
export function usInstrumentId(symbol: string): string {
  return `${symbol.trim().toUpperCase()}.US`;
}

/** Stooq's symbol for a US ticker (e.g. "tsla.us"). */
function stooqSymbol(symbol: string): string {
  return `${symbol.trim().toLowerCase()}.us`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// US equities close ~16:00 ET ≈ 20:00 UTC; a fair as-of for an EOD bar.
function asOfFor(date: string): string {
  return `${date}T20:00:00Z`;
}

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || /^n\/?d$/i.test(trimmed)) return null; // Stooq writes "N/D" for no data
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Parse a Stooq CSV into header-keyed rows. */
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((key, i) => { row[key] = (cells[i] ?? "").trim(); });
    return row;
  });
}

function barFromRow(instrumentId: string, row: Record<string, string>): PriceBar | null {
  const date = row.date;
  const close = num(row.close);
  if (!date || close == null || close <= 0) return null;
  return {
    instrument_id: instrumentId,
    price_date: date,
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close,
    adj_close: null,
    volume: num(row.volume),
    currency: "USD",
    source: "stooq",
    as_of: asOfFor(date),
  };
}

/**
 * Why a quote failed, not just that it did.
 *
 * These were one `null` before, and the desk reported every one of them as "I
 * don't have that symbol in my market data" — which reads as a coverage gap the
 * user should go fix. For a typo that sent people at a data pipeline instead of
 * a spelling correction, and for an unreachable feed it hid an outage behind a
 * message about missing rows. Feed health and symbol validity are different
 * facts and the reply has to be able to tell them apart.
 */
export type LiveQuoteOutcome =
  | { status: "ok"; bar: PriceBar }
  /** The feed answered and has nothing for this symbol — usually not a real ticker. */
  | { status: "no-data" }
  /** The feed did not answer (blocked, timed out, non-2xx). Says nothing about the symbol. */
  | { status: "unreachable"; detail: string }
  /** Not a plausible ticker; never reached the network. */
  | { status: "invalid-symbol" };

/**
 * The latest end-of-day quote for a US symbol, with the reason when there isn't
 * one. Live path — short timeout, so a slow feed degrades to the stored bar
 * rather than blocking the turn.
 */
export async function liveStockQuoteOutcome(
  symbol: string,
  { fetchFn = fetch, timeoutMs = LIVE_TIMEOUT_MS }: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<LiveQuoteOutcome> {
  const sym = String(symbol || "").trim();
  if (!TICKER.test(sym)) return { status: "invalid-symbol" };
  try {
    const url = `${LATEST_ENDPOINT}?s=${encodeURIComponent(stooqSymbol(sym))}&f=sd2ohlcv&h&e=csv`;
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) } as any);
    if (!response.ok) return { status: "unreachable", detail: `HTTP ${response.status}` };
    const rows = parseCsv(await response.text());
    if (!rows.length) return { status: "no-data" };
    const bar = barFromRow(usInstrumentId(sym), rows[0]);
    // A parsed row with no usable close is Stooq's "N/D" — the feed is healthy,
    // it simply does not carry this symbol.
    return bar ? { status: "ok", bar } : { status: "no-data" };
  } catch (err: any) {
    return { status: "unreachable", detail: err?.message || String(err) };
  }
}

/** A rolling window of daily EOD bars for a US symbol (oldest first). */
export async function stooqDailyHistory(
  symbol: string,
  {
    fetchFn = fetch,
    timeoutMs = FETCH_TIMEOUT_MS,
    windowDays = DEFAULT_WINDOW_DAYS,
    now = new Date(),
  }: { fetchFn?: typeof fetch; timeoutMs?: number; windowDays?: number; now?: Date } = {},
): Promise<PriceBar[]> {
  const sym = String(symbol || "").trim();
  if (!TICKER.test(sym)) return [];
  const d2 = isoDate(now).replace(/-/g, "");
  const d1 = isoDate(new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)).replace(/-/g, "");
  const url = `${HISTORY_ENDPOINT}?s=${encodeURIComponent(stooqSymbol(sym))}&d1=${d1}&d2=${d2}&i=d`;
  const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) } as any);
  if (!response.ok) throw new Error(`stooq history ${response.status} for ${sym}`);
  const instrumentId = usInstrumentId(sym);
  return parseCsv(await response.text())
    .map((row) => barFromRow(instrumentId, row))
    .filter((bar): bar is PriceBar => bar !== null);
}

/**
 * Nightly EOD-history provider for the default equity universe. Partial success
 * is fine — one bad symbol degrades coverage, not the run.
 */
export function stooqPricesProvider(
  symbols: string[] = DEFAULT_SYMBOLS,
  windowDays: number = DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): MarketDataProvider {
  return {
    id: "stooq-prices",
    label: "US equity EOD (Stooq)",
    async fetch(): Promise<ProviderFetch> {
      const prices: PriceBar[] = [];
      const errors: string[] = [];
      for (const symbol of symbols) {
        try {
          prices.push(...(await stooqDailyHistory(symbol, { windowDays, now })));
        } catch (err: any) {
          errors.push(err?.message || String(err));
        }
      }
      if (!prices.length && errors.length) throw new Error(errors.join("; "));
      return { prices };
    },
  };
}
