/**
 * Market-data store (ADR-025, P0).
 *
 * The read/serve side of the market-data foundation. Ingestion (a scheduled
 * job, out of band) writes the tables in 0027_market_data_foundation.sql; the
 * Finance turn reads them back here, deterministically, before the model
 * speaks. Mirrors `model-store.js`: service-role REST, a short module-level TTL
 * cache on the hot path, and — deliberately — empty results are never cached,
 * because an empty read usually means a momentary outage, and caching it would
 * blind the analyst for the whole TTL window.
 *
 * Every fact this module returns carries `source` and `as_of`, so a caller can
 * cite provenance and refuse stale data (see `isBarStale`) rather than present
 * a number as current. That is the whole trust contract.
 */

const REST_TIMEOUT_MS = 5_000;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isMarketDataStoreConfigured(): boolean {
  return config() !== null;
}

async function request(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Market-data store ${init.method || "GET"} ${path} -> ${response.status}`);
      return null;
    }
    return response;
  } catch (err: any) {
    console.warn("Market-data store unavailable:", err?.message || err);
    return null;
  }
}

async function readRows<T>(path: string): Promise<T[]> {
  const response = await request(path, { method: "GET" });
  if (!response) return [];
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch {
    return [];
  }
}

// ---- Types (our normalized shape — never a vendor's schema) ----------------

export type Instrument = {
  instrument_id: string;
  symbol: string;
  name: string | null;
  asset_type: string;
  currency: string | null;
  exchange: string | null;
  sector: string | null;
  source: string;
  as_of: string | null;
  status: string;
};

export type PriceBar = {
  instrument_id: string;
  price_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adj_close: number | null;
  volume: number | null;
  currency: string | null;
  source: string;
  as_of: string;
};

export type FxRate = {
  base_currency: string;
  quote_currency: string;
  rate_date: string;
  rate: number;
  source: string;
  as_of: string;
};

export type Fundamental = {
  instrument_id: string;
  as_of_date: string;
  metrics: Record<string, unknown>;
  source: string;
  as_of: string;
};

const ID = "instrument_id,symbol,name,asset_type,currency,exchange,sector,source,as_of,status";
const BAR = "instrument_id,price_date,open,high,low,close,adj_close,volume,currency,source,as_of";

// ---- Reads -----------------------------------------------------------------

export async function readInstrument(instrumentId: string): Promise<Instrument | null> {
  if (!instrumentId) return null;
  const rows = await readRows<Instrument>(
    `market_instruments?select=${ID}&instrument_id=eq.${encodeURIComponent(instrumentId)}&limit=1`,
  );
  return rows[0] || null;
}

/** Most recent bar for one instrument, or null if none is stored. */
export async function readLatestPrice(instrumentId: string): Promise<PriceBar | null> {
  if (!instrumentId) return null;
  const rows = await readRows<PriceBar>(
    `market_prices?select=${BAR}&instrument_id=eq.${encodeURIComponent(instrumentId)}&order=price_date.desc&limit=1`,
  );
  return rows[0] || null;
}

/** Price history for one instrument in [from, to] (ISO dates), oldest first. */
export async function readPriceHistory(
  instrumentId: string,
  from: string,
  to: string,
): Promise<PriceBar[]> {
  if (!instrumentId || !from || !to) return [];
  return readRows<PriceBar>(
    `market_prices?select=${BAR}&instrument_id=eq.${encodeURIComponent(instrumentId)}` +
      `&price_date=gte.${encodeURIComponent(from)}&price_date=lte.${encodeURIComponent(to)}` +
      `&order=price_date.asc&limit=20000`,
  );
}

/** Most recent FX rate for base→quote, or null. */
export async function readLatestFxRate(base: string, quote: string): Promise<FxRate | null> {
  if (!base || !quote) return null;
  const rows = await readRows<FxRate>(
    `fx_rates?select=*&base_currency=eq.${encodeURIComponent(base)}` +
      `&quote_currency=eq.${encodeURIComponent(quote)}&order=rate_date.desc&limit=1`,
  );
  return rows[0] || null;
}

/** Most recent fundamentals snapshot for one instrument, or null. */
export async function readLatestFundamentals(instrumentId: string): Promise<Fundamental | null> {
  if (!instrumentId) return null;
  const rows = await readRows<Fundamental>(
    `market_fundamentals?select=*&instrument_id=eq.${encodeURIComponent(instrumentId)}` +
      `&order=as_of_date.desc&limit=1`,
  );
  return rows[0] || null;
}

// ---- Hot-path cache (mirrors model-store's registry cache) ------------------

const DEFAULT_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

/**
 * Cache a read by key for `ttlMs`. Empty/absent values are NOT cached — same
 * reasoning as the model registry: a momentary miss must not stick.
 */
async function cachedRead<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  const empty = value == null || (Array.isArray(value) && value.length === 0);
  if (!empty) cache.set(key, { at: now, value });
  return value;
}

/** Latest FX rate for base→quote, absorbed by the TTL cache. */
export function readLatestFxRateCached(
  base: string,
  quote: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<FxRate | null> {
  return cachedRead(`fx:${base}:${quote}`, ttlMs, () => readLatestFxRate(base, quote));
}

/** Test/edge hook: drop the cache so the next read is fresh. */
export function clearMarketDataCache(): void {
  cache.clear();
}

// ---- Staleness (the refusal rule, as a pure function) ----------------------

const DEFAULT_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000; // 4 days — covers a long weekend of EOD data

/**
 * True when a datum's `as_of` is older than `maxAgeMs` (or missing/invalid).
 * The Finance turn uses this to say "I don't have current data on X" instead of
 * presenting a stale number as live. Pure and network-free by design.
 */
export function isBarStale(
  datum: { as_of?: string | null } | null | undefined,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  now: number = Date.now(),
): boolean {
  if (!datum || !datum.as_of) return true;
  const asOf = Date.parse(datum.as_of);
  if (!Number.isFinite(asOf)) return true;
  return now - asOf > maxAgeMs;
}

// ---- Writes (used by the out-of-band ingestion job) ------------------------

async function upsert(table: string, onConflict: string, rows: unknown[]): Promise<boolean> {
  if (!rows.length) return false;
  const response = await request(`${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  return Boolean(response);
}

export function writeInstruments(rows: Instrument[]): Promise<boolean> {
  return upsert("market_instruments", "instrument_id", rows);
}

export function writePrices(rows: PriceBar[]): Promise<boolean> {
  return upsert("market_prices", "instrument_id,price_date", rows);
}

export function writeFxRates(rows: FxRate[]): Promise<boolean> {
  return upsert("fx_rates", "base_currency,quote_currency,rate_date", rows);
}

export function writeFundamentals(rows: Fundamental[]): Promise<boolean> {
  return upsert("market_fundamentals", "instrument_id,as_of_date", rows);
}
