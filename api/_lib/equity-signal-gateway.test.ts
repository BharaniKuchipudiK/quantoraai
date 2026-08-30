import assert from "node:assert/strict";
import test from "node:test";

const { handleSignalRead } = await import("./equity-signal-gateway.js");

/** Fails loudly if a non-matching turn touches the response at all. */
function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

function capturingRes() {
  const chunks: string[] = [];
  return {
    chunks,
    writeHead() {}, setHeader() {},
    write(chunk: string) { chunks.push(chunk); },
    end() {}, status() { return this; }, json() { return this; },
    text() {
      return chunks
        .map((c) => { try { return JSON.parse(c.replace(/^data: /, "").trim())?.text; } catch { return null; } })
        .filter(Boolean).join("");
    },
  };
}

function withFetch(handler: typeof fetch) {
  const original = global.fetch;
  global.fetch = handler;
  return () => { global.fetch = original; };
}

/** Five years of a rising series, as Stooq's daily CSV. */
function stooqCsv(days = 1400): string {
  const rows = ["Date,Open,High,Low,Close,Volume"];
  const start = Date.UTC(2021, 0, 1);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const close = (100 + i * 0.15 + Math.sin(i / 9) * 6).toFixed(2);
    rows.push(`${d},${close},${close},${close},${close},1000000`);
  }
  return rows.join("\n") + "\n";
}

const finnhubOk = { c: 319.7, h: 321, l: 315, o: 316, t: Math.floor(Date.now() / 1000) };

/** Routes finnhub / stooq-history / stooq-quote to separate canned responses. */
function feeds({ quote, history }: { quote?: any; history?: string | Error }) {
  return (async (url: any) => {
    const u = String(url);
    if (u.includes("finnhub.io")) {
      if (!quote) return { ok: false, status: 503, json: async () => ({}) } as any;
      return { ok: true, status: 200, json: async () => quote } as any;
    }
    if (u.includes("/q/d/l/")) {
      if (history instanceof Error) throw history;
      if (!history) return { ok: false, status: 403, text: async () => "" } as any;
      return { ok: true, status: 200, text: async () => history } as any;
    }
    return { ok: true, status: 200, text: async () => "Symbol,Date,Open,High,Low,Close,Volume\nAAPL.US,N/D,N/D,N/D,N/D,N/D,N/D\n" } as any;
  }) as any;
}

test("does not intercept another workspace (isolation)", async () => {
  assert.equal(await handleSignalRead(
    { method: "POST", body: { studioDomain: "travel", message: "should I buy Apple" } }, untouchableRes(),
  ), false);
});

test("does not intercept ordinary finance conversation", async () => {
  assert.equal(await handleSignalRead(
    { method: "POST", body: { studioDomain: "finance", message: "should I pay down my mortgage?" } }, untouchableRes(),
  ), false);
});

/* A plain price question belongs to the price desk, which already answers it well. */
test("leaves a plain price question alone", async () => {
  assert.equal(await handleSignalRead(
    { method: "POST", body: { studioDomain: "finance", message: "how much is Apple" } }, untouchableRes(),
  ), false);
});

test("does not intercept a non-POST request", async () => {
  assert.equal(await handleSignalRead(
    { method: "GET", body: { studioDomain: "finance", message: "should I buy Apple" } }, untouchableRes(),
  ), false);
});

/*
 * The reported defect, end to end. This exact question previously reached the
 * language model and returned an essay with no fact about Apple in it.
 */
test("answers the investment question with computed, sourced facts", async () => {
  const saved = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-key";
  const restore = withFetch(feeds({ quote: finnhubOk, history: stooqCsv() }));
  try {
    const res = capturingRes();
    assert.equal(await handleSignalRead(
      { method: "POST", body: { studioDomain: "finance", message: "can you please tell me when is the best time to invest in Apple." }, headers: {} },
      res,
    ), true);
    const text = res.text();

    assert.match(text, /319\.70/, "the live price must be in the answer");
    assert.match(text, /●/, "the wordless range bar must be present");
    assert.match(text, /52-week range/);
    assert.match(text, /rolling windows/, "historical base rates must be present");
    assert.match(text, /Median/);
    assert.match(text, /timing is not your lever/i, "it must state a view, not just list facts");
    assert.match(text, /not a licensed adviser/i, "the boundary stays");
    assert.doesNotMatch(text, /workflow/i, "no internal runbook copy");
  } finally {
    restore();
    if (saved === undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY = saved;
  }
});

/*
 * The whole point of the base-rate block: answer the number that was asked
 * about. Someone asking about 20% must not be answered about a default 10%.
 */
test("counts base rates against the return target in the question", async () => {
  const saved = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-key";
  const restore = withFetch(feeds({ quote: finnhubOk, history: stooqCsv() }));
  try {
    const res = capturingRes();
    await handleSignalRead(
      { method: "POST", body: { studioDomain: "finance", message: "can I get 20% returns investing in Apple?" }, headers: {} },
      res,
    );
    assert.match(res.text(), /Returned 20% or more/, "must answer the asked-for threshold");
  } finally {
    restore();
    if (saved === undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY = saved;
  }
});

/*
 * Degradation is the contract. History failing must cost the ANALYSIS, never
 * the price — and the reply must say which half is missing rather than quietly
 * shipping a thinner card.
 */
test("keeps the price and says what's missing when history is unreachable", async () => {
  const saved = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-key";
  const restore = withFetch(feeds({ quote: finnhubOk, history: new Error("connect ETIMEDOUT") }));
  try {
    const res = capturingRes();
    assert.equal(await handleSignalRead(
      { method: "POST", body: { studioDomain: "finance", message: "should I buy Apple" }, headers: {} }, res,
    ), true);
    const text = res.text();
    assert.match(text, /319\.70/, "the real price survives a history outage");
    assert.match(text, /couldn't pull enough history/i, "and the gap is named");
    assert.doesNotMatch(text, /rolling windows/, "no base rates invented from nothing");
    assert.doesNotMatch(text, /●/, "no range bar drawn without a range");
  } finally {
    restore();
    if (saved === undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY = saved;
  }
});

test("reports a price-feed outage as an outage, not as an unknown company", async () => {
  const saved = process.env.FINNHUB_API_KEY;
  delete process.env.FINNHUB_API_KEY;
  const restore = withFetch((async () => { throw new Error("connect ETIMEDOUT"); }) as any);
  try {
    const res = capturingRes();
    assert.equal(await handleSignalRead(
      { method: "POST", body: { studioDomain: "finance", message: "should I buy Apple" }, headers: {} }, res,
    ), true);
    assert.match(res.text(), /couldn't reach the price feed/i);
  } finally {
    restore();
    if (saved !== undefined) process.env.FINNHUB_API_KEY = saved;
  }
});
