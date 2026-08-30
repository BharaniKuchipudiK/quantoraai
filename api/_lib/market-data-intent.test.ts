import assert from "node:assert/strict";
import test from "node:test";

import { parseMarketDataIntent } from "./market-data-intent.js";

test("detects an FX pair with a connector", () => {
  assert.deepEqual(parseMarketDataIntent("USD to SGD"), { kind: "fx", base: "USD", quote: "SGD", amount: null });
  assert.deepEqual(parseMarketDataIntent("EUR/USD"), { kind: "fx", base: "EUR", quote: "USD", amount: null });
  assert.deepEqual(parseMarketDataIntent("what's usd in inr right now"), { kind: "fx", base: "USD", quote: "INR", amount: null });
});

test("captures a conversion amount", () => {
  assert.deepEqual(parseMarketDataIntent("convert 1,000 USD to SGD"), { kind: "fx", base: "USD", quote: "SGD", amount: 1000 });
  assert.deepEqual(parseMarketDataIntent("how much is 2k EUR in GBP"), { kind: "fx", base: "EUR", quote: "GBP", amount: 2000 });
});

test("uses the rate/convert hint fallback when two currencies appear without a connector", () => {
  assert.deepEqual(parseMarketDataIntent("what is the USD SGD exchange rate"), { kind: "fx", base: "USD", quote: "SGD", amount: null });
});

test("grounds a conversion asked in spoken currency names, not just ISO codes", () => {
  assert.deepEqual(
    parseMarketDataIntent("How much is one Singapore dollar in Indian Rupees"),
    { kind: "fx", base: "SGD", quote: "INR", amount: null },
  );
  assert.deepEqual(
    parseMarketDataIntent("convert 500 euros to pounds"),
    { kind: "fx", base: "EUR", quote: "GBP", amount: 500 },
  );
  assert.deepEqual(
    parseMarketDataIntent("what's the US dollar worth in yen"),
    { kind: "fx", base: "USD", quote: "JPY", amount: null },
  );
});

test("a spoken-name pair still needs a conversion signal, not a passing mention", () => {
  assert.equal(parseMarketDataIntent("I keep some euros and pounds in my wallet").kind, null);
  assert.equal(parseMarketDataIntent("the Singapore dollar has been strong lately").kind, null);
});

test("does not match a single currency or same-currency pair", () => {
  assert.equal(parseMarketDataIntent("I have some USD saved").kind, null);
  assert.equal(parseMarketDataIntent("USD to USD").kind, null);
});

test("detects a stock quote and extracts the ticker", () => {
  assert.deepEqual(parseMarketDataIntent("what's the price of AAPL"), { kind: "price", symbol: "AAPL" });
  assert.deepEqual(parseMarketDataIntent("MSFT stock price?"), { kind: "price", symbol: "MSFT" });
  assert.deepEqual(parseMarketDataIntent("quote for tsla"), { kind: "price", symbol: "TSLA" });
});

test("catches the plain 'how much is TSLA' ask (uppercase ticker)", () => {
  assert.deepEqual(parseMarketDataIntent("How much is TSLA"), { kind: "price", symbol: "TSLA" });
  assert.deepEqual(parseMarketDataIntent("how much is $nvda"), { kind: "price", symbol: "NVDA" });
});

test("'how much is <word>' does not read a lowercase word as a ticker", () => {
  assert.equal(parseMarketDataIntent("How much is my rent").kind, null);
  assert.equal(parseMarketDataIntent("how much is tsla").kind, null); // must type the ticker uppercase
  assert.equal(parseMarketDataIntent("How much is USD").kind, null); // a currency, not a stock
});

test("ordinary finance conversation does not match", () => {
  assert.equal(parseMarketDataIntent("what do you think about tech stocks this year?").kind, null);
  assert.equal(parseMarketDataIntent("should I pay down my mortgage or invest?").kind, null);
  assert.equal(parseMarketDataIntent("").kind, null);
  assert.equal(parseMarketDataIntent(null).kind, null);
});

/*
 * People ask for a company by name far more often than by ticker. The
 * uppercase-only ticker rules discarded "Apple" as a bare lowercase word, so
 * "how much is Apple" never reached the deterministic desk at all.
 */
test("detects a stock quote asked by company name", () => {
  assert.deepEqual(parseMarketDataIntent("how much is Apple"), { kind: "price", symbol: "AAPL" });
  assert.deepEqual(parseMarketDataIntent("what's the price of Tesla?"), { kind: "price", symbol: "TSLA" });
  assert.deepEqual(parseMarketDataIntent("Microsoft stock price"), { kind: "price", symbol: "MSFT" });
  assert.deepEqual(parseMarketDataIntent("price of Nvidia shares"), { kind: "price", symbol: "NVDA" });
});

test("a company name that is not a known issuer does not become a quote", () => {
  assert.equal(parseMarketDataIntent("how much is my rent").kind, null);
  assert.equal(parseMarketDataIntent("how much is the mortgage").kind, null);
});
