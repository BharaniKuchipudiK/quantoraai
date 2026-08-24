import assert from "node:assert/strict";
import test from "node:test";

import { fxLookupResult, priceLookupResult } from "./market-data-lookup.js";
import type { FxRate, PriceBar, Instrument } from "./market-data-store.js";

const NOW = new Date("2026-08-24T12:00:00Z");
const FRESH = "2026-08-22T16:00:00Z"; // 2 days old — within the 4-day window
const STALE = "2026-08-10T16:00:00Z"; // two weeks old

const usdSgd: FxRate = { base_currency: "USD", quote_currency: "SGD", rate_date: "2026-08-22", rate: 1.35, source: "ecb", as_of: FRESH };

test("FX: quotes a fresh, sourced rate and cites as-of + source", () => {
  const r = fxLookupResult({ kind: "fx", base: "USD", quote: "SGD", amount: null }, usdSgd, null, NOW);
  assert.equal(r.resolved, true);
  assert.match(r.text, /1 USD = 1\.3500 SGD/);
  assert.match(r.text, /ECB \(Frankfurter\)/);
  assert.match(r.text, /2026-08-22/);
});

test("FX: computes a conversion when an amount is given", () => {
  const r = fxLookupResult({ kind: "fx", base: "USD", quote: "SGD", amount: 1000 }, usdSgd, null, NOW);
  assert.match(r.text, /1,000\.00 USD = 1,350\.00 SGD/);
});

test("FX: inverts a stored reverse rate when the direct one is absent", () => {
  const sgdUsd: FxRate = { base_currency: "SGD", quote_currency: "USD", rate_date: "2026-08-22", rate: 0.8, source: "ecb", as_of: FRESH };
  const r = fxLookupResult({ kind: "fx", base: "USD", quote: "SGD", amount: null }, null, sgdUsd, NOW);
  assert.equal(r.resolved, true);
  assert.match(r.text, /1 USD = 1\.2500 SGD/); // 1 / 0.8
});

test("FX: refuses a stale rate instead of quoting it", () => {
  const r = fxLookupResult({ kind: "fx", base: "USD", quote: "SGD", amount: null }, { ...usdSgd, as_of: STALE, rate_date: "2026-08-10" }, null, NOW);
  assert.equal(r.resolved, false);
  assert.equal(r.stale, true);
  assert.match(r.text, /older than I'll rely on/);
});

test("FX: refuses when no rate is stored (never invents one)", () => {
  const r = fxLookupResult({ kind: "fx", base: "USD", quote: "SGD", amount: null }, null, null, NOW);
  assert.equal(r.resolved, false);
  assert.match(r.text, /don't have a stored/);
  assert.match(r.text, /will not invent one/);
});

const aaplBar: PriceBar = {
  instrument_id: "AAPL.US", price_date: "2026-08-22", open: null, high: null, low: null,
  close: 231.4, adj_close: null, volume: null, currency: "USD", source: "marketstack", as_of: FRESH,
};

test("price: quotes a fresh close with source", () => {
  const r = priceLookupResult({ kind: "price", symbol: "AAPL" }, aaplBar, null, NOW);
  assert.equal(r.resolved, true);
  assert.match(r.text, /AAPL — 231\.40 USD/);
  assert.match(r.text, /marketstack/);
});

test("price: refuses a stale close", () => {
  const r = priceLookupResult({ kind: "price", symbol: "AAPL" }, { ...aaplBar, as_of: STALE, price_date: "2026-08-10" }, null, NOW);
  assert.equal(r.resolved, false);
  assert.equal(r.stale, true);
});

test("price: known instrument but no price data explains the gap honestly", () => {
  const inst: Instrument = {
    instrument_id: "AAPL.US", symbol: "AAPL", name: "Apple Inc.", asset_type: "equity",
    currency: "USD", exchange: null, sector: null, source: "sec", as_of: FRESH, status: "active",
  };
  const r = priceLookupResult({ kind: "price", symbol: "AAPL" }, null, inst, NOW);
  assert.equal(r.resolved, false);
  assert.match(r.text, /no price data/);
  assert.match(r.text, /won't guess a price/);
});

test("price: unknown symbol refuses rather than inventing", () => {
  const r = priceLookupResult({ kind: "price", symbol: "ZZZZ" }, null, null, NOW);
  assert.equal(r.resolved, false);
  assert.match(r.text, /don't have \*\*ZZZZ\*\*/);
});
