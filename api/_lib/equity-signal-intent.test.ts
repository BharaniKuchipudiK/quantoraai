import assert from "node:assert/strict";
import test from "node:test";

import { parseSignalIntent } from "./equity-signal-intent.js";

/*
 * The reported gap. Same company, same session: "how much is Apple" reached the
 * deterministic desk and returned a live sourced price; "when is the best time
 * to invest in Apple" did not, and came back as a generic essay with no fact
 * about Apple in it. Phrasing alone decided which.
 */
test("catches the investment phrasings that used to fall through to chat", () => {
  const asks = [
    "can you please tell me when is the best time to invest in Apple.",
    "should I buy Apple?",
    "is Apple a good investment",
    "when should I buy AAPL",
    "thinking of investing in Apple next month",
    "is Tesla worth buying right now",
    "shall I invest in Microsoft",
  ];
  for (const ask of asks) {
    const intent = parseSignalIntent(ask);
    assert.equal(intent.kind, "signal", `missed: ${ask}`);
  }
});

test("resolves the company from prose, by name or by ticker", () => {
  assert.equal((parseSignalIntent("best time to invest in Apple") as any).symbol, "AAPL");
  assert.equal((parseSignalIntent("should I buy NVDA") as any).symbol, "NVDA");
  assert.equal((parseSignalIntent("is Coca-Cola a good investment") as any).symbol, "KO");
});

/*
 * An investment verb without a company is a general question, and a company
 * without an investment verb is ordinary conversation. Both belong in chat.
 */
test("needs both an investment ask and a company", () => {
  assert.equal(parseSignalIntent("is now a good time to invest").kind, null);
  assert.equal(parseSignalIntent("should I invest more this year").kind, null);
  assert.equal(parseSignalIntent("I work at Apple").kind, null);
  assert.equal(parseSignalIntent("Tesla was in the news today").kind, null);
  assert.equal(parseSignalIntent("").kind, null);
  assert.equal(parseSignalIntent(null).kind, null);
});

/*
 * "how much is Apple" is the PRICE desk's question and it already answers it
 * well. This parser must not take it — two desks fighting over one turn is how
 * the answer becomes non-deterministic.
 */
test("leaves a plain price question to the price desk", () => {
  assert.equal(parseSignalIntent("how much is Apple").kind, null);
  assert.equal(parseSignalIntent("what's the price of AAPL").kind, null);
  assert.equal(parseSignalIntent("AAPL stock price").kind, null);
});

/*
 * The target return is the whole point of the base-rate block: someone asking
 * about 20% should be answered about 20%, not about a house default of 10%.
 */
test("takes the return target from the question when one is named", () => {
  assert.equal((parseSignalIntent("can I get 20% returns investing in Apple") as any).thresholdPct, 20);
  assert.equal((parseSignalIntent("should I buy TSLA for a 15% gain") as any).thresholdPct, 15);
  assert.equal((parseSignalIntent("best time to invest in Apple") as any).thresholdPct, 10);
});

test("ignores an implausible or malformed return target", () => {
  assert.equal((parseSignalIntent("should I buy AAPL for 9000% returns") as any).thresholdPct, 10);
  assert.equal((parseSignalIntent("should I buy AAPL for 0% returns") as any).thresholdPct, 10);
});
