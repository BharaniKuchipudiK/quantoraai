import assert from "node:assert/strict";
import test from "node:test";

import {
  liveStockQuoteOutcome,
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
  const quote = await liveStockQuoteOutcome("TSLA", { fetchFn: ok(LATEST) });
  assert.equal(quote.status, "ok");
  const bar = (quote as any).bar;
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
  assert.equal((await liveStockQuoteOutcome("ZZZZ", { fetchFn: ok(nd) })).status, "no-data");
  assert.equal((await liveStockQuoteOutcome("TSLA", { fetchFn: fail() })).status, "unreachable");
});

test("live quote rejects a non-ticker before any network call", async () => {
  let called = false;
  const spy: any = async () => { called = true; return { ok: true, status: 200, text: async () => LATEST }; };
  assert.equal((await liveStockQuoteOutcome("not a ticker!", { fetchFn: spy })).status, "invalid-symbol");
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

/*
 * Feed health and symbol validity are different facts. They shared one `null`
 * before, so an outage and a typo produced the same reply — "I don't have that
 * in my market data" — which blamed the question for a problem on our side.
 */
test("liveStockQuoteOutcome distinguishes a good quote, no data, and an unreachable feed", async () => {
  const { liveStockQuoteOutcome } = await import("./stooq-provider.js");
  const respond = (body: string, ok = true, status = 200) =>
    (async () => ({ ok, status, text: async () => body })) as any;

  const good = await liveStockQuoteOutcome("AAPL", {
    fetchFn: respond("Symbol,Date,Open,High,Low,Close,Volume\nAAPL.US,2026-08-28,232.1,234.5,231,233.87,41230000\n"),
  });
  assert.equal(good.status, "ok");
  assert.equal((good as any).bar.close, 233.87);

  // Stooq writes "N/D" for a symbol it does not carry — the feed is healthy.
  const nd = await liveStockQuoteOutcome("APL", {
    fetchFn: respond("Symbol,Date,Open,High,Low,Close,Volume\nAPL.US,N/D,N/D,N/D,N/D,N/D,N/D\n"),
  });
  assert.equal(nd.status, "no-data");

  const blocked = await liveStockQuoteOutcome("AAPL", { fetchFn: respond("", false, 403) });
  assert.equal(blocked.status, "unreachable");

  const threw = await liveStockQuoteOutcome("AAPL", {
    fetchFn: (async () => { throw new Error("connect ETIMEDOUT"); }) as any,
  });
  assert.equal(threw.status, "unreachable");

  assert.equal((await liveStockQuoteOutcome("not a ticker!")).status, "invalid-symbol");
});
