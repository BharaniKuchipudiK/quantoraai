/**
 * The US equity universe from SEC EDGAR's public `company_tickers.json` — public
 * domain, free, commercial-OK, no key. Populates market_instruments so later
 * phases (prices from a paid feed, fundamentals from SEC company facts) have a
 * reference universe to attach to.
 *
 * SEC asks every automated caller to send a descriptive User-Agent; we send a
 * neutral app identifier (no personal data).
 */

import type { Instrument } from "../market-data-store.js";
import type { MarketDataProvider, ProviderFetch } from "./provider.js";

const ENDPOINT = "https://www.sec.gov/files/company_tickers.json";
const USER_AGENT = "QuantoraAI/1.0 market-data ingestion";
const FETCH_TIMEOUT_MS = 15_000;

type SecRow = { cik_str?: number; ticker?: string; title?: string };

function normalize(rows: SecRow[], asOf: string): Instrument[] {
  const out: Instrument[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const ticker = String(row?.ticker || "").trim().toUpperCase();
    if (!ticker) continue;
    const instrumentId = `${ticker}.US`;
    if (seen.has(instrumentId)) continue; // first ticker wins on the rare dupe
    seen.add(instrumentId);
    out.push({
      instrument_id: instrumentId,
      symbol: ticker,
      name: (row?.title && String(row.title).trim()) || null,
      asset_type: "equity",
      currency: "USD",
      exchange: null,
      sector: null,
      source: "sec",
      as_of: asOf,
      status: "active",
    });
  }
  return out;
}

export function secInstrumentsProvider(): MarketDataProvider {
  return {
    id: "sec-instruments",
    label: "SEC EDGAR equity universe",
    async fetch(): Promise<ProviderFetch> {
      const response = await fetch(ENDPOINT, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`SEC company_tickers -> ${response.status}`);
      const payload = await response.json();
      // The file is an object keyed "0".."N", not an array.
      const rows = payload && typeof payload === "object" ? (Object.values(payload) as SecRow[]) : [];
      const instruments = normalize(rows, new Date().toISOString());
      if (!instruments.length) throw new Error("SEC company_tickers returned no usable rows");
      return { instruments };
    },
  };
}
