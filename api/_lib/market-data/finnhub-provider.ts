/**
 * Real-time US equity quotes from Finnhub (https://finnhub.io).
 *
 * Why this exists alongside Stooq: Stooq is free and keyless but END-OF-DAY, so
 * "how much is TSLA" during market hours answers with yesterday's close. That is
 * honest — it is labelled a close — but it is not what somebody watching a
 * position is asking for. Finnhub's quote endpoint carries the current price
 * intraday.
 *
 * Optional by construction. Without FINNHUB_API_KEY this module reports
 * "unconfigured" and the caller falls back to Stooq, so the platform keeps
 * working at zero cost and zero setup. A key upgrades freshness; its absence
 * never breaks a quote.
 *
 * LICENSING — read before pointing this at a paid or monetized deployment.
 * Finnhub's FREE tier is for personal, non-commercial use. A monetized product
 * needs a paid plan. The wire format is identical across their tiers, so this
 * adapter serves both: the plan is a billing decision, not a code change.
 *
 * Pure and network-injectable (fetch is a param), so it is testable offline.
 */

import type { PriceBar } from "../market-data-store.js";
import { usInstrumentId } from "./stooq-provider.js";

const QUOTE_ENDPOINT = "https://finnhub.io/api/v1/quote";
// A live lookup sits in front of a waiting person, so it gets a short leash.
const LIVE_TIMEOUT_MS = 2_500;

const TICKER = /^[A-Za-z]{1,6}(?:\.[A-Za-z]{1,3})?$/;

/** Marks a bar as an intraday price rather than a settled close. */
export const FINNHUB_SOURCE = "finnhub";

export type RealtimeQuoteOutcome =
  | { status: "ok"; bar: PriceBar }
  /** No API key configured — not an error; the caller falls back to EOD. */
  | { status: "unconfigured" }
  /** The API answered and carries no usable price for this symbol. */
  | { status: "no-data" }
  /** The API did not answer, or rejected the key. Says nothing about the symbol. */
  | { status: "unreachable"; detail: string }
  | { status: "invalid-symbol" };

function finnhubKey(): string | null {
  const key = String(process.env.FINNHUB_API_KEY || "").trim();
  return key || null;
}

/**
 * The current price for a US symbol.
 *
 * Finnhub's /quote returns { c: current, h, l, o, pc: previous close, t: unix }.
 * A `c` of 0 is how it reports "no such symbol" — a real price is never zero, so
 * that is treated as no-data rather than a quote of $0.00.
 */
export async function realtimeQuote(
  symbol: string,
  {
    fetchFn = fetch,
    timeoutMs = LIVE_TIMEOUT_MS,
    apiKey = finnhubKey(),
    now = new Date(),
  }: { fetchFn?: typeof fetch; timeoutMs?: number; apiKey?: string | null; now?: Date } = {},
): Promise<RealtimeQuoteOutcome> {
  if (!apiKey) return { status: "unconfigured" };
  const sym = String(symbol || "").trim();
  if (!TICKER.test(sym)) return { status: "invalid-symbol" };

  try {
    const url = `${QUOTE_ENDPOINT}?symbol=${encodeURIComponent(sym.toUpperCase())}&token=${encodeURIComponent(apiKey)}`;
    const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) } as any);
    // 401/403 (bad key) and 429 (over quota) are OUR problem, not the symbol's.
    if (!response.ok) return { status: "unreachable", detail: `HTTP ${response.status}` };

    const body: any = await response.json();
    const current = Number(body?.c);
    if (!Number.isFinite(current) || current <= 0) return { status: "no-data" };

    // Finnhub stamps the quote in unix seconds; fall back to now if absent.
    const stamped = Number(body?.t);
    const at = Number.isFinite(stamped) && stamped > 0 ? new Date(stamped * 1000) : now;

    const num = (raw: unknown): number | null => {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    return {
      status: "ok",
      bar: {
        instrument_id: usInstrumentId(sym),
        price_date: at.toISOString().slice(0, 10),
        open: num(body?.o),
        high: num(body?.h),
        low: num(body?.l),
        close: current,
        adj_close: null,
        volume: null,
        currency: "USD",
        source: FINNHUB_SOURCE,
        as_of: at.toISOString(),
      },
    };
  } catch (err: any) {
    return { status: "unreachable", detail: err?.message || String(err) };
  }
}
