import assert from "node:assert/strict";
import test from "node:test";

const { handleMarketDataLookup } = await import("./market-data-gateway.js");

// A response object that fails loudly if the gateway touches it — proving the
// non-matching paths return false without any side effect on the turn.
function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("does not intercept a non-finance domain (isolation)", async () => {
  const handled = await handleMarketDataLookup(
    { method: "POST", body: { studioDomain: "travel", message: "USD to SGD" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept ordinary finance conversation", async () => {
  const handled = await handleMarketDataLookup(
    { method: "POST", body: { studioDomain: "finance", message: "should I invest more this year?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept a non-POST request", async () => {
  const handled = await handleMarketDataLookup(
    { method: "GET", body: { studioDomain: "finance", message: "USD to SGD" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

/*
 * FX answers live first, store second.
 *
 * Conversion used to be answerable only from the Supabase table that the Market
 * Data Ingestion workflow fills, and that workflow never ran on a schedule — so
 * the stored rate aged past the four-day staleness window and the desk refused
 * every conversion until somebody clicked "Run workflow" by hand. Two
 * independent paths now, and these tests hold that line.
 */

/** Collects the SSE text the gateway streams, so the answer can be read back. */
function capturingRes() {
  const chunks: string[] = [];
  return {
    chunks,
    writeHead() {},
    setHeader() {},
    write(chunk: string) { chunks.push(chunk); },
    end() {},
    status() { return this; },
    json() { return this; },
    text() {
      return chunks
        .map((c) => { try { return JSON.parse(c.replace(/^data: /, "").trim())?.text; } catch { return null; } })
        .filter(Boolean)
        .join("");
    },
  };
}

function withFetch(handler: typeof fetch) {
  const original = global.fetch;
  global.fetch = handler;
  return () => { global.fetch = original; };
}

const today = () => new Date().toISOString().slice(0, 10);

test("FX: a live ECB rate answers the turn with no store involved", async () => {
  const restore = withFetch((async () => new Response(
    JSON.stringify({ date: today(), rates: { SGD: 1.3421 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch);
  try {
    const res = capturingRes();
    const handled = await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "convert 100 USD to SGD" }, headers: {} },
      res,
    );
    assert.equal(handled, true);
    assert.match(res.text(), /1 USD = 1\.3421 SGD/);
    assert.match(res.text(), /100\.00 USD = 134\.21 SGD/);
  } finally {
    restore();
  }
});

test("INVARIANT: with no store configured, a live rate still answers", async () => {
  // Before the live path this turn was refused outright with "market data isn't
  // connected on this deployment yet" — a real refusal on a deployment that
  // needed no credential to answer, since the ECB feed is free and keyless.
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const restore = withFetch((async () => new Response(
    JSON.stringify({ date: today(), rates: { INR: 87.42 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch);
  try {
    const res = capturingRes();
    await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "USD to INR" }, headers: {} },
      res,
    );
    assert.match(res.text(), /1 USD = 87\.4200 INR/);
    assert.doesNotMatch(res.text(), /isn't connected/);
  } finally {
    restore();
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});

test("FX: a dead live feed refuses honestly rather than inventing a rate", async () => {
  // With no store and no live answer there is nothing to quote. The one thing
  // that must never happen is a number appearing anyway.
  const savedUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  const restore = withFetch((async () => { throw new Error("ECONNRESET"); }) as typeof fetch);
  try {
    const res = capturingRes();
    const handled = await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "USD to INR" }, headers: {} },
      res,
    );
    assert.equal(handled, true);
    assert.match(res.text(), /couldn't reach a real source|don't have a stored/,
      "refuses by naming the missing source, not by inventing a rate");
    assert.doesNotMatch(res.text(), /1 USD = \d/);
  } finally {
    restore();
    if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
  }
});

/*
 * The door has a real caller now.
 *
 * A review found the door path living in the planner, which no production
 * caller ever supplied, so not one of the messages could reach a user. This
 * gateway is where the knowledge actually is: it has just looked in the store
 * and found nothing.
 */

test('an unconfigured store answers with steps, not a dead end', async () => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const restore = withFetch((async () => { throw new Error("no live feed either"); }) as typeof fetch);
  try {
    const res = capturingRes();
    const handled = await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "AAPL price" }, headers: {} },
      res,
    );
    assert.equal(handled, true);
    const text = res.text();
    assert.match(text, /^1\. /m, "numbered steps a person can follow");
    assert.match(text, /SUPABASE_SERVICE_ROLE_KEY/, "names the thing to set");
    assert.match(text, /You'll know it worked/, "and how to check");
    assert.doesNotMatch(text, /isn't connected on this deployment yet/, "the dead end is gone");
  } finally {
    restore();
    if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
    if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});

test('INVARIANT: a figure is still never invented when the door is shut', async () => {
  // The door replaces the copy, not the refusal. Nothing may produce a number.
  const savedUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  const restore = withFetch((async () => { throw new Error("down"); }) as typeof fetch);
  try {
    const res = capturingRes();
    await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "AAPL price" }, headers: {} },
      res,
    );
    assert.doesNotMatch(res.text(), /\$\s?\d/, "no price, invented or otherwise");
  } finally {
    restore();
    if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
  }
});

/*
 * The reported defect, end to end.
 *
 * "How much is APL?" produced: "I don't have APL in my market data, so I can't
 * quote it … If it's a US-listed symbol, run the Market Data Ingestion workflow
 * to load the reference universe." Three things wrong at once — a typo
 * described as a coverage gap, a remedy the reader cannot perform, and no
 * mention of AAPL sitting one keystroke away.
 */
test("a mistyped ticker names the nearest real symbol, not a data pipeline", async () => {
  const restore = withFetch((async () => ({
    ok: true,
    status: 200,
    text: async () => "Symbol,Date,Open,High,Low,Close,Volume\nAPL.US,N/D,N/D,N/D,N/D,N/D,N/D\n",
  })) as any);
  try {
    const res = capturingRes();
    const handled = await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "How much is APL?" } },
      res,
    );
    assert.equal(handled, true);
    const text = res.text();
    assert.match(text, /AAPL/, "must name the ticker the user probably meant");
    assert.match(text, /Apple/, "must name the company so the suggestion is checkable");
    assert.doesNotMatch(text, /Market Data Ingestion/i, "must not hand the user an internal workflow");
    assert.doesNotMatch(text, /workflow/i, "no CI instructions in a user-facing reply");
  } finally { restore(); }
});

test("an unreachable feed says so instead of blaming the symbol", async () => {
  // With a store present, a feed outage must not masquerade as an unknown
  // ticker: the store is consulted first, and only its silence ends the turn.
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const restore = withFetch((async () => { throw new Error("connect ETIMEDOUT"); }) as any);
  try {
    const res = capturingRes();
    const handled = await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "What is the price of AAPL?" } },
      res,
    );
    assert.equal(handled, true);
    const text = res.text();
    assert.match(text, /couldn't reach/i, "an outage must be reported as an outage");
    assert.doesNotMatch(text, /don't recognise/i, "must not call a real ticker unknown when the feed is down");
    assert.doesNotMatch(text, /Market Data Ingestion/i);
  } finally {
    restore();
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});

test("a live quote answers with a real dated close", async () => {
  const restore = withFetch((async () => ({
    ok: true,
    status: 200,
    text: async () => `Symbol,Date,Open,High,Low,Close,Volume\nAAPL.US,${today()},232.1,234.5,231,233.87,41230000\n`,
  })) as any);
  try {
    const res = capturingRes();
    const handled = await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "how much is Apple" } },
      res,
    );
    assert.equal(handled, true);
    assert.match(res.text(), /233\.87/, "a company name must reach the real quote");
  } finally { restore(); }
});

/*
 * Real-time first, end-of-day beneath it.
 *
 * A deployment with no FINNHUB_API_KEY must quote exactly as it did before, and
 * a real-time OUTAGE must fall through to the settled close rather than end the
 * turn — a yesterday's close beats no answer at all.
 */
test("a real-time quote is labelled live, not 'last close'", async () => {
  const saved = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-key";
  const restore = withFetch((async (url: any) => {
    if (String(url).includes("finnhub.io")) {
      return { ok: true, status: 200, json: async () => ({ c: 233.87, h: 234.5, l: 231, o: 232.1, t: Math.floor(Date.now() / 1000) }) } as any;
    }
    throw new Error("stooq must not be consulted when real-time answered");
  }) as any);
  try {
    const res = capturingRes();
    assert.equal(await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "What is the price of AAPL?" }, headers: {} }, res,
    ), true);
    const text = res.text();
    assert.match(text, /233\.87/);
    assert.match(text, /\(live\)/, "an intraday price must not be called a close");
    assert.doesNotMatch(text, /last close/);
  } finally {
    restore();
    if (saved === undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY = saved;
  }
});

test("with no key, quoting falls back to the end-of-day close unchanged", async () => {
  const saved = process.env.FINNHUB_API_KEY;
  delete process.env.FINNHUB_API_KEY;
  const restore = withFetch((async (url: any) => {
    if (String(url).includes("finnhub.io")) throw new Error("must not call finnhub without a key");
    return { ok: true, status: 200, text: async () => `Symbol,Date,Open,High,Low,Close,Volume\nAAPL.US,${today()},232.1,234.5,231,233.87,41230000\n` } as any;
  }) as any);
  try {
    const res = capturingRes();
    assert.equal(await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "What is the price of AAPL?" }, headers: {} }, res,
    ), true);
    assert.match(res.text(), /233\.87/);
    assert.match(res.text(), /last close/, "an EOD bar must be labelled a close");
  } finally {
    restore();
    if (saved !== undefined) process.env.FINNHUB_API_KEY = saved;
  }
});

test("a real-time outage falls through to the end-of-day close", async () => {
  const saved = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-key";
  const restore = withFetch((async (url: any) => {
    if (String(url).includes("finnhub.io")) return { ok: false, status: 429, json: async () => ({}) } as any;
    return { ok: true, status: 200, text: async () => `Symbol,Date,Open,High,Low,Close,Volume\nAAPL.US,${today()},232.1,234.5,231,233.87,41230000\n` } as any;
  }) as any);
  try {
    const res = capturingRes();
    assert.equal(await handleMarketDataLookup(
      { method: "POST", body: { studioDomain: "finance", message: "What is the price of AAPL?" }, headers: {} }, res,
    ), true);
    assert.match(res.text(), /233\.87/, "an over-quota real-time feed must not cost the user their answer");
  } finally {
    restore();
    if (saved === undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY = saved;
  }
});
