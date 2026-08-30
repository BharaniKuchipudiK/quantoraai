import assert from "node:assert/strict";
import test from "node:test";

import { realtimeQuote, FINNHUB_SOURCE } from "./finnhub-provider.js";

const json = (body: unknown, ok = true, status = 200) =>
  (async () => ({ ok, status, json: async () => body })) as any;

test("returns a live bar from a real quote payload", async () => {
  const out = await realtimeQuote("AAPL", {
    apiKey: "test-key",
    fetchFn: json({ c: 233.87, h: 234.5, l: 231.0, o: 232.1, pc: 231.4, t: 1787000000 }),
  });
  assert.equal(out.status, "ok");
  const bar = (out as any).bar;
  assert.equal(bar.close, 233.87);
  assert.equal(bar.instrument_id, "AAPL.US");
  assert.equal(bar.source, FINNHUB_SOURCE);
  assert.equal(bar.currency, "USD");
});

/*
 * Without a key this must be a quiet "not configured", never an error: the
 * caller falls back to the keyless end-of-day feed, so a deployment that never
 * sets FINNHUB_API_KEY keeps quoting exactly as it did before.
 */
test("reports unconfigured when no API key is set, without touching the network", async () => {
  let called = false;
  const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as any;
  const out = await realtimeQuote("AAPL", { apiKey: null, fetchFn: spy });
  assert.equal(out.status, "unconfigured");
  assert.equal(called, false, "must not call the API without a key");
});

/*
 * Finnhub reports an unknown symbol as a current price of 0. A real price is
 * never zero, so this must read as no-data — quoting "$0.00" for a bad ticker
 * would be the worst possible failure for a finance desk.
 */
test("a zero price is no-data, never a quote of $0", async () => {
  const out = await realtimeQuote("NOPE", {
    apiKey: "test-key",
    fetchFn: json({ c: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }),
  });
  assert.equal(out.status, "no-data");
});

test("a rejected key or exhausted quota is an outage, not a verdict on the symbol", async () => {
  for (const status of [401, 403, 429, 500]) {
    const out = await realtimeQuote("AAPL", { apiKey: "test-key", fetchFn: json({}, false, status) });
    assert.equal(out.status, "unreachable", `HTTP ${status} must be unreachable`);
  }
  const threw = await realtimeQuote("AAPL", {
    apiKey: "test-key",
    fetchFn: (async () => { throw new Error("connect ETIMEDOUT"); }) as any,
  });
  assert.equal(threw.status, "unreachable");
});

test("rejects an implausible ticker before spending a call", async () => {
  let called = false;
  const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as any;
  const out = await realtimeQuote("not a ticker!", { apiKey: "test-key", fetchFn: spy });
  assert.equal(out.status, "invalid-symbol");
  assert.equal(called, false);
});
