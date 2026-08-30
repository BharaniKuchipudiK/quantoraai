/**
 * Market-data provider seam (ADR-025, P1).
 *
 * A provider FETCHES and NORMALIZES external data into our own shape — it never
 * writes the database. The ingestion orchestrator persists what a provider
 * returns via the store's writers. This split keeps vendors swappable (the whole
 * point of the seam) and keeps providers trivially testable with a mocked fetch.
 *
 * Adding a paid feed later (prices, richer fundamentals) is a new file that
 * implements this interface — no consumer, store, or schema change.
 */

import type { Instrument, FxRate, Fundamental, PriceBar } from "../market-data-store.js";

export type ProviderFetch = {
  instruments?: Instrument[];
  fxRates?: FxRate[];
  fundamentals?: Fundamental[];
  prices?: PriceBar[];
};

export type MarketDataProvider = {
  id: string;
  label: string;
  /** Network + normalization only. Throws on a hard failure; the orchestrator isolates it. */
  fetch(): Promise<ProviderFetch>;
};

export type ProviderOutcome = {
  provider: string;
  ok: boolean;
  wrote: { instruments: number; fxRates: number; fundamentals: number; prices: number };
  error?: string;
};
