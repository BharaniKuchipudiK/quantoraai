import assert from "node:assert/strict";
import test from "node:test";

import { parseDebtIntent } from "./debt-intent.js";

test("extracts debts and monthly budget from a clear request", () => {
  const r = parseDebtIntent("help me pay off my debts: $5,000 at 19.99% (min $150) and $3,000 at 24%, I can put $600/month");
  assert.equal(r.matched, true);
  assert.equal(r.debts.length, 2);
  assert.equal(r.debts[0].balance, 5000);
  assert.equal(r.debts[0].apr, 19.99);
  assert.equal(r.debts[0].minPayment, 150);
  assert.equal(r.debts[1].balance, 3000);
  assert.equal(r.debts[1].apr, 24);
  assert.equal(r.extraMonthly, 600);
  assert.equal(r.assumedMinimums, true); // second debt had no stated minimum
});

test("accepts '@' and 'per month' phrasing", () => {
  const r = parseDebtIntent("debt payoff plan for 4000 @ 18% min 100, budget 500 per month");
  assert.equal(r.matched, true);
  assert.equal(r.debts.length, 1);
  assert.equal(r.debts[0].minPayment, 100);
  assert.equal(r.extraMonthly, 500);
  assert.equal(r.assumedMinimums, false);
});

test("a debt-plan ask with no numbers still matches (gateway will ask for them)", () => {
  const r = parseDebtIntent("can you help me with debt consolidation?");
  assert.equal(r.matched, true);
  assert.equal(r.debts.length, 0);
  assert.equal(r.extraMonthly, null);
});

test("ordinary finance conversation does not match", () => {
  assert.equal(parseDebtIntent("what do you think about the stock market?").matched, false);
  assert.equal(parseDebtIntent("how much should I save for retirement?").matched, false);
  assert.equal(parseDebtIntent("").matched, false);
  assert.equal(parseDebtIntent(null).matched, false);
});
