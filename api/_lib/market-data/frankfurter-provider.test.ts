import assert from "node:assert/strict";
import test from "node:test";

const { frankfurterProvider, liveFxRate } = await import("./frankfurter-provider.js");

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

test("normalizes ECB rates into fx_rates rows with source and as_of", async () => {
  const restore = mockFetch(() => ({ base: "USD", date: "2026-08-21", rates: { EUR: 0.92, SGD: 1.35 } }));
  try {
    const data = await frankfurterProvider(["USD"], ["USD", "EUR", "SGD"]).fetch();
    const rows = data.fxRates || [];
    assert.equal(rows.length, 2, "self-pair excluded, two quotes remain");
    const eur = rows.find((r) => r.quote_currency === "EUR");
    assert.deepEqual(eur, {
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

test("drops non-finite rates", async () => {
  const restore = mockFetch(() => ({ base: "USD", date: "2026-08-21", rates: { EUR: 0.92, JPY: null } }));
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
    return { base: "USD", date: "2026-08-21", rates: { EUR: 0.92 } };
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
  const restore = mockFetch(() => ({ base: "USD", date: "2026-08-21", rates: {} }));
  try {
    // single base, unusable response -> every base failed -> provider throws
    await assert.rejects(() => frankfurterProvider(["USD"], ["EUR"]).fetch(), /no usable rates/);
  } finally {
    restore();
  }
});

/*
 * The live path. It exists because FX conversion used to depend entirely on a
 * workflow that never ran on a schedule, so the stored rate aged out every four
 * days and the desk refused every conversion until somebody clicked a button.
 * The rule for everything below: a live-path failure returns null so the store
 * still gets its turn — it must never take down an answer the store could give.
 */

const okJson = (body: unknown) => (async () => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
})) as unknown as typeof fetch;

test("live: one pair comes back as an FxRate carrying its source and date", async () => {
  const rate = await liveFxRate("USD", "INR", {
    fetchFn: okJson({ base: "USD", date: "2026-08-28", rates: { INR: 87.42 } }),
  });
  assert.deepEqual(rate, {
    base_currency: "USD",
    quote_currency: "INR",
    rate_date: "2026-08-28",
    rate: 87.42,
    source: "ecb",
    as_of: "2026-08-28T16:00:00Z",
  });
});

test("live: currency codes are normalised before the request is built", async () => {
  let seen = "";
  const rate = await liveFxRate(" usd ", "inr", {
    fetchFn: (async (url: any) => {
      seen = String(url);
      return new Response(JSON.stringify({ date: "2026-08-28", rates: { INR: 87.42 } }), { status: 200 });
    }) as any,
  });
  assert.match(seen, /from=USD&to=INR/);
  assert.equal(rate?.rate, 87.42);
});

test("live: anything that is not a currency code never reaches the network", async () => {
  // These are interpolated into a URL. A strict shape check is cheaper to
  // reason about than an argument over escaping.
  let called = 0;
  const fetchFn = (async () => { called += 1; return new Response("{}", { status: 200 }); }) as any;
  for (const [from, to] of [["US", "INR"], ["USD", "RUPEE"], ["../x", "INR"], ["USD", "USD"], ["", "INR"]]) {
    assert.equal(await liveFxRate(from, to, { fetchFn }), null, `${from}->${to} must be refused`);
  }
  assert.equal(called, 0);
});

test("INVARIANT: a live failure returns null so the stored rate still gets its turn", async () => {
  const failures: Array<[string, any]> = [
    ["HTTP 500", (async () => new Response("nope", { status: 500 })) as any],
    ["a thrown network error", (async () => { throw new Error("ECONNRESET"); }) as any],
    ["200 with unparseable body", (async () => new Response("<html>", { status: 200 })) as any],
    ["200 carrying no date", okJson({ rates: { INR: 87.42 } })],
    ["200 carrying no rate for the pair", okJson({ date: "2026-08-28", rates: { EUR: 0.92 } })],
    ["200 with a non-finite rate", okJson({ date: "2026-08-28", rates: { INR: null } })],
    ["200 with a zero rate", okJson({ date: "2026-08-28", rates: { INR: 0 } })],
  ];
  for (const [label, fetchFn] of failures) {
    assert.equal(await liveFxRate("USD", "INR", { fetchFn }), null, `${label} must return null, not throw`);
  }
});

test("live: a slow feed gives up quickly rather than holding the turn", async () => {
  const started = Date.now();
  const rate = await liveFxRate("USD", "INR", {
    timeoutMs: 40,
    fetchFn: (async (_url: any, init: any) => new Promise((resolve, reject) => {
      // A real timer far beyond the deadline, so the abort is what ends this
      // and not the event loop simply running dry.
      const slow = setTimeout(() => resolve(new Response("{}", { status: 200 })), 5_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(slow);
        reject(new Error("aborted"));
      });
    })) as any,
  });
  assert.equal(rate, null);
  assert.ok(Date.now() - started < 1_000, "the live path must not sit on the deadline");
});
