import assert from "node:assert/strict";
import test from "node:test";

const { frankfurterProvider } = await import("./frankfurter-provider.js");

function mockFetch(handler: (url: string) => unknown) {
  const original = global.fetch;
  global.fetch = (async (input: any) => {
    const body = handler(String(input));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => { global.fetch = original; };
}

// Frankfurter time-series shape: rates keyed by date, then by quote currency.
const TS = {
  base: "USD",
  start_date: "2026-08-19",
  end_date: "2026-08-21",
  rates: {
    "2026-08-19": { EUR: 0.91, SGD: 1.34 },
    "2026-08-21": { EUR: 0.92, SGD: 1.35 },
  },
};

test("normalizes an ECB time-series into per-day fx_rates rows with source and as_of", async () => {
  const restore = mockFetch(() => TS);
  try {
    const data = await frankfurterProvider(["USD"], ["USD", "EUR", "SGD"]).fetch();
    const rows = data.fxRates || [];
    // 2 dates x 2 quotes (self-pair excluded upstream via `to`)
    assert.equal(rows.length, 4);
    const eur21 = rows.find((r) => r.quote_currency === "EUR" && r.rate_date === "2026-08-21");
    assert.deepEqual(eur21, {
      base_currency: "USD",
      quote_currency: "EUR",
      rate_date: "2026-08-21",
      rate: 0.92,
      source: "ecb",
      as_of: "2026-08-21T16:00:00Z",
    });
  } finally {
    restore();
  }
});

test("requests a start..end range with from/to symbols", async () => {
  let seen = "";
  const restore = mockFetch((url) => { seen = url; return TS; });
  try {
    await frankfurterProvider(["USD"], ["EUR"], 30).fetch();
    assert.match(seen, /\/\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}\?from=USD&to=EUR/);
  } finally {
    restore();
  }
});

test("drops non-finite rates", async () => {
  const restore = mockFetch(() => ({
    base: "USD",
    rates: { "2026-08-21": { EUR: 0.92, JPY: null } },
  }));
  try {
    const rows = (await frankfurterProvider(["USD"], ["EUR", "JPY"]).fetch()).fxRates || [];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].quote_currency, "EUR");
  } finally {
    restore();
  }
});

test("a partial base failure still yields the bases that worked", async () => {
  const restore = mockFetch((url) => {
    if (url.includes("from=SGD")) throw new Error("network");
    return { base: "USD", rates: { "2026-08-21": { EUR: 0.92 } } };
  });
  try {
    const rows = (await frankfurterProvider(["USD", "SGD"], ["EUR"]).fetch()).fxRates || [];
    assert.equal(rows.length, 1, "USD succeeded even though SGD threw");
    assert.equal(rows[0].base_currency, "USD");
  } finally {
    restore();
  }
});

test("throws only when every base fails", async () => {
  const restore = mockFetch(() => { throw new Error("down"); });
  try {
    await assert.rejects(() => frankfurterProvider(["USD", "SGD"], ["EUR"]).fetch());
  } finally {
    restore();
  }
});

test("an HTTP-200 response with no usable rates is treated as a failure, not empty success", async () => {
  const restore = mockFetch(() => ({ base: "USD", rates: {} }));
  try {
    await assert.rejects(() => frankfurterProvider(["USD"], ["EUR"]).fetch(), /no usable rates/);
  } finally {
    restore();
  }
});
