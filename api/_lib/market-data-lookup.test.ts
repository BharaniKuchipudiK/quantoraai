import assert from "node:assert/strict";
import test from "node:test";

import { freshestFxRate, fxLookupResult, priceLookupResult } from "./market-data-lookup.js";
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
  assert.match(r.text, /couldn't reach a real source/);
  assert.match(r.text, /won't invent one/);
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
  assert.match(r.text, /don't hold a price/);
  assert.match(r.text, /won't guess one/);
});

test("price: unknown symbol refuses rather than inventing", () => {
  const r = priceLookupResult({ kind: "price", symbol: "ZZZZ" }, null, null, NOW);
  assert.equal(r.resolved, false);
  assert.match(r.text, /don't recognise \*\*ZZZZ\*\*/);
  // The remedy must be something the reader can act on — never a CI job.
  assert.doesNotMatch(r.text, /workflow/i);
});

/*
 * A stale row must never MASK a fresh one.
 *
 * Two hops had this defect, both the same shape: something was treated as the
 * answer because it arrived first, not because it was checked. A live rate that
 * arrived before the store was read, and a direct row that was preferred over
 * an inverse one whatever their dates.
 */

const row = (rate: number, asOf: string, base = 'USD', quote = 'INR') => ({
  base_currency: base, quote_currency: quote, rate,
  rate_date: asOf.slice(0, 10), as_of: asOf, source: 'ecb',
});

const AT_NINE = new Date('2026-08-28T09:00:00Z');
const YESTERDAY = '2026-08-27T16:00:00Z';
const LAST_MONTH = '2026-08-01T16:00:00Z';

test('freshestFxRate picks by publication date, not by argument order', () => {
  const older = row(80, LAST_MONTH);
  const newer = row(87, YESTERDAY);
  assert.equal(freshestFxRate(older, newer)?.rate, 87);
  assert.equal(freshestFxRate(newer, older)?.rate, 87);
});

test('freshestFxRate ignores rows that cannot be used or dated', () => {
  assert.equal(freshestFxRate(null, undefined), null);
  assert.equal(freshestFxRate(row(0, YESTERDAY)), null, 'a zero rate is not a rate');
  assert.equal(freshestFxRate({ ...row(87, YESTERDAY), as_of: 'not-a-date' } as any), null);
  assert.equal(freshestFxRate(row(87, YESTERDAY), row(0, YESTERDAY))?.rate, 87);
});

test('INVARIANT: a stale live rate does not mask a fresh stored one', () => {
  // The live feed answered, so the old code stopped there and the turn was
  // refused as stale — with a usable rate sitting in the database.
  const staleLive = row(80, LAST_MONTH);
  const freshStored = row(87.42, YESTERDAY);
  const result = fxLookupResult(
    { kind: 'fx', base: 'USD', quote: 'INR', amount: null } as any,
    freshestFxRate(staleLive, freshStored),
    null,
    AT_NINE,
  );
  assert.equal(result.resolved, true);
  assert.match(result.text, /87\.4200 INR/);
});

test('INVARIANT: a stale direct rate does not shadow a fresh inverse one', () => {
  const staleDirect = row(80, LAST_MONTH);
  const freshInverse = row(0.0125, YESTERDAY, 'INR', 'USD');
  const result = fxLookupResult(
    { kind: 'fx', base: 'USD', quote: 'INR', amount: null } as any,
    staleDirect,
    freshInverse,
    AT_NINE,
  );
  assert.equal(result.resolved, true, 'the fresh inverse should answer');
  assert.match(result.text, /80\.0000 INR/, 'inverted 1/0.0125 = 80');
});

test('when everything is stale it still names the date it is refusing', () => {
  const result = fxLookupResult(
    { kind: 'fx', base: 'USD', quote: 'INR', amount: null } as any,
    row(80, LAST_MONTH),
    null,
    AT_NINE,
  );
  assert.equal(result.stale, true);
  assert.match(result.text, /2026-08-01/);
});
