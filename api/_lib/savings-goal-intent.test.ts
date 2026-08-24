import assert from "node:assert/strict";
import test from "node:test";

import { parseSavingsIntent } from "./savings-goal-intent.js";

test("extracts goal, horizon, monthly, starting balance and rate", () => {
  const r = parseSavingsIntent("I want to save $20,000 for a house down payment in 3 years, I have $2,000 now and can put away $400/month at 4% return");
  assert.equal(r.matched, true);
  assert.equal(r.goal, 20000);
  assert.equal(r.current, 2000);
  assert.equal(r.monthly, 400);
  assert.equal(r.months, 36);
  assert.equal(r.annualRatePct, 4);
});

test("handles k-suffixed amounts and a month horizon, defaulting current to 0", () => {
  const r = parseSavingsIntent("save 15k in 18 months, $500/month");
  assert.equal(r.matched, true);
  assert.equal(r.goal, 15000);
  assert.equal(r.months, 18);
  assert.equal(r.monthly, 500);
  assert.equal(r.current, 0);
  assert.equal(r.annualRatePct, 0);
});

test("a savings ask with missing numbers still matches (gateway will ask for them)", () => {
  const r = parseSavingsIntent("I want to save more money");
  assert.equal(r.matched, true);
  assert.equal(r.goal, null);
});

test("ordinary finance conversation does not match", () => {
  assert.equal(parseSavingsIntent("should I invest more this year?").matched, false);
  assert.equal(parseSavingsIntent("what's my portfolio doing?").matched, false);
  assert.equal(parseSavingsIntent("").matched, false);
  assert.equal(parseSavingsIntent(null).matched, false);
});
