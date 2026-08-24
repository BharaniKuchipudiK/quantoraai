import assert from "node:assert/strict";
import test from "node:test";

const { runIngestion } = await import("./ingest.js");
import type { MarketDataProvider } from "./provider.js";
import type { Instrument, FxRate, Fundamental } from "../market-data-store.js";

function captureWriters() {
  const calls = { instruments: [] as Instrument[][], fx: [] as FxRate[][], fundamentals: [] as Fundamental[][] };
  return {
    calls,
    writers: {
      writeInstruments: async (rows: Instrument[]) => { calls.instruments.push(rows); return true; },
      writeFxRates: async (rows: FxRate[]) => { calls.fx.push(rows); return true; },
      writeFundamentals: async (rows: Fundamental[]) => { calls.fundamentals.push(rows); return true; },
    },
  };
}

const fx = (n: number): FxRate[] =>
  Array.from({ length: n }, (_, i) => ({
    base_currency: "USD", quote_currency: `Q${i}`, rate_date: "2026-08-21", rate: 1 + i, source: "ecb", as_of: "2026-08-21T16:00:00Z",
  }));

test("persists what a provider returns and reports the counts", async () => {
  const provider: MarketDataProvider = { id: "p", label: "p", fetch: async () => ({ fxRates: fx(3) }) };
  const { calls, writers } = captureWriters();
  const outcomes = await runIngestion([provider], writers);
  assert.equal(outcomes[0].ok, true);
  assert.equal(outcomes[0].wrote.fxRates, 3);
  assert.equal(calls.fx.flat().length, 3);
});

test("one failing provider does not abort the others", async () => {
  const bad: MarketDataProvider = { id: "bad", label: "bad", fetch: async () => { throw new Error("boom"); } };
  const good: MarketDataProvider = { id: "good", label: "good", fetch: async () => ({ fxRates: fx(1) }) };
  const { calls, writers } = captureWriters();
  const outcomes = await runIngestion([bad, good], writers);
  assert.equal(outcomes[0].ok, false);
  assert.match(outcomes[0].error || "", /boom/);
  assert.equal(outcomes[1].ok, true);
  assert.equal(calls.fx.flat().length, 1, "the good provider still wrote");
});

test("large row sets are chunked into multiple writes", async () => {
  const provider: MarketDataProvider = { id: "big", label: "big", fetch: async () => ({ fxRates: fx(2500) }) };
  const { calls, writers } = captureWriters();
  const outcomes = await runIngestion([provider], writers);
  assert.equal(outcomes[0].wrote.fxRates, 2500);
  assert.equal(calls.fx.length, 3, "2500 rows -> 3 chunks of <=1000");
  assert.equal(calls.fx.flat().length, 2500);
});

test("a rejected write is a failure, not a silent success", async () => {
  const provider: MarketDataProvider = { id: "p", label: "p", fetch: async () => ({ fxRates: fx(2) }) };
  const writers = {
    writeInstruments: async () => true,
    writeFxRates: async () => false, // store rejected the write (e.g. Supabase down)
    writeFundamentals: async () => true,
  };
  const outcomes = await runIngestion([provider], writers);
  assert.equal(outcomes[0].ok, false, "provider is not reported successful");
  assert.equal(outcomes[0].wrote.fxRates, 0, "nothing counted as written");
  assert.match(outcomes[0].error || "", /rejected writes: fxRates/);
});
