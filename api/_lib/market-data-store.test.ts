import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

const {
  readLatestPrice,
  readFxHistory,
  clearMarketDataCache,
  isBarStale,
  isMarketDataStoreConfigured,
} = await import("./market-data-store.js");

function mockFetch(rows: unknown) {
  let calls = 0;
  const original = global.fetch;
  global.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { restore: () => { global.fetch = original; }, count: () => calls };
}

const BAR = {
  instrument_id: "AAPL.US",
  price_date: "2026-08-21",
  close: 231.4,
  currency: "USD",
  source: "marketstack",
  as_of: "2026-08-21T20:00:00Z",
};

test("readLatestPrice returns the single most recent bar, or null", async () => {
  const fetchMock = mockFetch([BAR]);
  try {
    assert.deepEqual(await readLatestPrice("AAPL.US"), BAR);
  } finally {
    fetchMock.restore();
  }
  const emptyMock = mockFetch([]);
  try {
    assert.equal(await readLatestPrice("AAPL.US"), null);
    assert.equal(await readLatestPrice(""), null, "no id -> null without a network call");
    assert.equal(emptyMock.count(), 1);
  } finally {
    emptyMock.restore();
  }
});

test("isBarStale refuses missing, unparseable, or old data; accepts fresh", () => {
  const now = Date.parse("2026-08-24T12:00:00Z");
  assert.equal(isBarStale(null, undefined, now), true, "null -> stale");
  assert.equal(isBarStale({ as_of: null }, undefined, now), true, "no as_of -> stale");
  assert.equal(isBarStale({ as_of: "not-a-date" }, undefined, now), true, "unparseable -> stale");
  assert.equal(
    isBarStale({ as_of: "2026-08-21T20:00:00Z" }, undefined, now),
    false,
    "3 days old, within the 4-day EOD window -> fresh",
  );
  assert.equal(
    isBarStale({ as_of: "2026-08-10T20:00:00Z" }, undefined, now),
    true,
    "two weeks old -> stale",
  );
  assert.equal(
    isBarStale({ as_of: "2026-08-24T09:00:00Z" }, 60 * 60 * 1000, now),
    true,
    "3h old against a 1h tolerance -> stale",
  );
});

test("readFxHistory returns the stored series, or [] when args are missing", async () => {
  const ROWS = [
    { base_currency: "USD", quote_currency: "SGD", rate_date: "2026-01-01", rate: 1.34, source: "ecb", as_of: "2026-01-01T16:00:00Z" },
    { base_currency: "USD", quote_currency: "SGD", rate_date: "2026-01-02", rate: 1.35, source: "ecb", as_of: "2026-01-02T16:00:00Z" },
  ];
  const fetchMock = mockFetch(ROWS);
  try {
    const rows = await readFxHistory("USD", "SGD", "2026-01-01", "2026-01-31");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].rate_date, "2026-01-01");
    assert.equal(await (async () => (await readFxHistory("", "SGD", "a", "b")).length)(), 0);
    assert.equal(fetchMock.count(), 1, "missing base -> no network call");
  } finally {
    fetchMock.restore();
  }
});

test("the store reports configured when Supabase env is present", () => {
  assert.equal(isMarketDataStoreConfigured(), true);
});
