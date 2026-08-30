import assert from "node:assert/strict";
import test from "node:test";

import {
  liveStockQuote,
  stooqDailyHistory,
  stooqPricesProvider,
  usInstrumentId,
} from "./stooq-provider.js";

function ok(text: string): any {
  return async () => ({ ok: true, status: 200, text: async () => text });
}
function fail(status = 404): any {
  return async () => ({ ok: false, status, text: async () => "" });
}

const LATEST = "Symbol,Date,Open,High,Low,Close,Volume\nTSLA.US,2026-08-29,250.00,255.00,248.00,252.34,90000000\n";

test("live quote parses the latest EOD close with provenance", async () => {
  const bar = await liveStockQuote("TSLA", { fetchFn: ok(LATEST) });
  assert.ok(bar);
  assert.equal(bar!.instrument_id, "TSLA.US");
  assert.equal(bar!.close, 252.34);
  assert.equal(bar!.currency, "USD");
  assert.equal(bar!.source, "stooq");
  assert.equal(bar!.price_date, "2026-08-29");
  assert.equal(bar!.as_of, "2026-08-29T20:00:00Z");
});

test("live quote returns null for a bad symbol (N/D) or a non-2xx", async () => {
  const nd = "Symbol,Date,Open,High,Low,Close,Volume\nZZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D\n";
  assert.equal(await liveStockQuote("ZZZZ", { fetchFn: ok(nd) }), null);
  assert.equal(await liveStockQuote("TSLA", { fetchFn: fail() }), null);
});

test("live quote rejects a non-ticker before any network call", async () => {
  let called = false;
  const spy: any = async () => { called = true; return { ok: true, status: 200, text: async () => LATEST }; };
  assert.equal(await liveStockQuote("not a ticker!", { fetchFn: spy }), null);
  assert.equal(called, false);
});

test("daily history parses a window of bars, oldest first, dropping bad rows", async () => {
  const csv = [
    "Date,Open,High,Low,Close,Volume",
    "2026-08-25,240,245,238,242.10,1000",
    "2026-08-26,242,250,241,248.00,1200",
    "2026-08-27,248,249,244,N/D,0", // no close -> dropped
  ].join("\n");
  const bars = await stooqDailyHistory("TSLA", { fetchFn: ok(csv) });
  assert.equal(bars.length, 2);
  assert.equal(bars[0].price_date, "2026-08-25");
  assert.equal(bars[1].close, 248.0);
  assert.ok(bars.every((b) => b.instrument_id === "TSLA.US" && b.source === "stooq"));
});

test("the nightly provider collects prices and survives a single bad symbol", async () => {
  const hist = "Date,Open,High,Low,Close,Volume\n2026-08-26,10,11,9,10.5,100\n";
  const fetchFn: any = async (url: string) =>
    /s=aapl\.us/i.test(url)
      ? { ok: false, status: 500, text: async () => "" } // one symbol fails
      : { ok: true, status: 200, text: async () => hist };
  const provider = stooqPricesProvider(["AAPL", "MSFT"], 30, new Date("2026-08-30T00:00:00Z"));
  // Inject the stub by monkeypatching global fetch for this provider call.
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = fetchFn;
  try {
    const data = await provider.fetch();
    assert.ok(data.prices && data.prices.length >= 1, "partial success still returns prices");
    assert.ok(data.prices!.every((b) => b.source === "stooq"));
  } finally {
    (globalThis as any).fetch = realFetch;
  }
});

test("usInstrumentId normalizes to the reference-universe id", () => {
  assert.equal(usInstrumentId("tsla"), "TSLA.US");
  assert.equal(usInstrumentId(" Nvda "), "NVDA.US");
});
