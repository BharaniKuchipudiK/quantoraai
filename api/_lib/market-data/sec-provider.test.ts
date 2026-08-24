import assert from "node:assert/strict";
import test from "node:test";

const { secInstrumentsProvider } = await import("./sec-provider.js");

function mockFetch(body: unknown, status = 200) {
  const original = global.fetch;
  let lastInit: any = null;
  global.fetch = (async (_input: any, init: any) => {
    lastInit = init;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { restore: () => { global.fetch = original; }, init: () => lastInit };
}

test("maps the keyed SEC object into equity instruments", async () => {
  const mock = mockFetch({
    "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
    "1": { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corp" },
  });
  try {
    const instruments = (await secInstrumentsProvider().fetch()).instruments || [];
    assert.equal(instruments.length, 2);
    const aapl = instruments.find((i) => i.symbol === "AAPL")!;
    assert.equal(aapl.instrument_id, "AAPL.US");
    assert.equal(aapl.asset_type, "equity");
    assert.equal(aapl.currency, "USD");
    assert.equal(aapl.source, "sec");
    assert.equal(aapl.status, "active");
    assert.ok(aapl.as_of, "carries an as_of stamp");
    assert.equal(mock.init()?.headers?.["User-Agent"], "QuantoraAI/1.0 market-data ingestion");
  } finally {
    mock.restore();
  }
});

test("skips blank tickers and de-dupes", async () => {
  const mock = mockFetch({
    "0": { cik_str: 1, ticker: "AAPL", title: "Apple Inc." },
    "1": { cik_str: 2, ticker: "", title: "No Ticker Co" },
    "2": { cik_str: 3, ticker: "aapl", title: "Apple dupe (lowercase)" },
  });
  try {
    const instruments = (await secInstrumentsProvider().fetch()).instruments || [];
    assert.equal(instruments.length, 1, "blank dropped, case-dupe collapsed");
    assert.equal(instruments[0].name, "Apple Inc.", "first ticker wins");
  } finally {
    mock.restore();
  }
});

test("throws on a non-OK response", async () => {
  const mock = mockFetch({}, 403);
  try {
    await assert.rejects(() => secInstrumentsProvider().fetch(), /403/);
  } finally {
    mock.restore();
  }
});
