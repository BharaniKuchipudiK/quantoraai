import assert from "node:assert/strict";
import test from "node:test";

import { parseFxAnalyticsIntent, parseLookbackDays, isFxAnalyticsIntent } from "./fx-analytics-intent.js";

test("matches an explicit performance question with a pair", () => {
  const i = parseFxAnalyticsIntent("how has USD to SGD performed this year?");
  assert.equal(isFxAnalyticsIntent(i), true);
  if (isFxAnalyticsIntent(i)) {
    assert.equal(i.base, "USD");
    assert.equal(i.quote, "SGD");
    assert.equal(i.days, 365);
  }
});

test("matches trend / volatility phrasings", () => {
  assert.equal(parseFxAnalyticsIntent("USD/INR trend").kind, "fx-analytics");
  assert.equal(parseFxAnalyticsIntent("EUR to USD volatility over the last 6 months").kind, "fx-analytics");
  assert.equal(parseFxAnalyticsIntent("how has SGD moved against USD historically").kind, "fx-analytics");
});

test("does NOT match a plain conversion (that is the point-lookup gateway's job)", () => {
  assert.equal(parseFxAnalyticsIntent("Convert 1,000 USD to SGD").kind, null);
  assert.equal(parseFxAnalyticsIntent("what is the USD to SGD rate?").kind, null);
});

test("does not match without a currency pair, or a same-currency pair", () => {
  assert.equal(parseFxAnalyticsIntent("how did the market perform this year?").kind, null);
  assert.equal(parseFxAnalyticsIntent("USD to USD trend").kind, null);
  assert.equal(parseFxAnalyticsIntent("").kind, null);
  assert.equal(parseFxAnalyticsIntent(null).kind, null);
});

test("parses lookback windows", () => {
  assert.equal(parseLookbackDays("last 90 days"), 90);
  assert.equal(parseLookbackDays("over the past 6 months"), 180);
  assert.equal(parseLookbackDays("2 year trend"), 730);
  assert.equal(parseLookbackDays("this month"), 30);
  assert.equal(parseLookbackDays("no window mentioned"), 365);
  const ytd = parseLookbackDays("ytd", new Date("2026-04-01T00:00:00Z"));
  assert.ok(ytd >= 89 && ytd <= 91, "Jan 1 → Apr 1 ≈ 90 days");
});
