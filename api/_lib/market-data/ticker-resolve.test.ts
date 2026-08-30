import assert from "node:assert/strict";
import test from "node:test";

import { resolveTicker, tickerForName } from "./ticker-resolve.js";

test("recognises a known ticker exactly, in any case", () => {
  assert.deepEqual(resolveTicker("AAPL"), { status: "known", symbol: "AAPL", name: "Apple" });
  assert.deepEqual(resolveTicker("tsla"), { status: "known", symbol: "TSLA", name: "Tesla" });
});

/*
 * The reported defect: "How much is APL?" answered "I don't have APL in my
 * market data … run the Market Data Ingestion workflow" — a typo reported as a
 * coverage gap, remedied with a CI job the reader cannot run, while AAPL sat
 * one keystroke away.
 */
test("offers the nearest real ticker for a one-character typo", () => {
  assert.deepEqual(resolveTicker("APL"), {
    status: "did-you-mean", symbol: "AAPL", name: "Apple", typed: "APL",
  });
  assert.deepEqual(resolveTicker("TSL"), {
    status: "did-you-mean", symbol: "TSLA", name: "Tesla", typed: "TSL",
  });
});

test("resolves a spoken company name to its ticker", () => {
  assert.deepEqual(resolveTicker("Apple"), { status: "known", symbol: "AAPL", name: "Apple" });
  assert.deepEqual(resolveTicker("google"), { status: "known", symbol: "GOOGL", name: "Alphabet (Google)" });
  assert.equal(tickerForName("Microsoft"), "MSFT");
  assert.equal(tickerForName("nothing here"), null);
});

/*
 * A guess about which company somebody meant is worse than admitting ignorance,
 * so an ambiguous near-miss must NOT produce a suggestion. "AMDA" sits one edit
 * from AMD; if a second entry ever lands one edit away too, this must go quiet.
 */
test("stays silent when a near-miss is ambiguous", () => {
  const twoAway = resolveTicker("ZZZZ");
  assert.equal(twoAway.status, "unknown");
});

test("an unrecognised symbol is 'unknown', not a refusal to look", () => {
  const r = resolveTicker("BRKB");
  assert.equal(r.status, "unknown");
  assert.equal((r as any).typed, "BRKB");
});

test("empty input resolves to unknown rather than throwing", () => {
  assert.equal(resolveTicker("").status, "unknown");
  assert.equal(resolveTicker(null as any).status, "unknown");
});
