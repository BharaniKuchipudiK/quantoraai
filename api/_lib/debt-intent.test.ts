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

test("a stated income is not payment capacity", () => {
  // The scenario that exposed this: obligations larger than income. Reading the
  // salary as "extra" told the simulator this person can pay their minimums PLUS
  // their whole salary, and it answered "debt-free in 1 yr".
  const r = parseDebtIntent(
    "Help me pay off my debts: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I only earn $15,000 per month.",
  );
  assert.equal(r.matched, true);
  assert.equal(r.debts.length, 2);
  assert.equal(r.extraMonthly, null);
  assert.equal(r.statedIncome, 15000);
});

test("income phrasings are all read as income", () => {
  for (const phrase of [
    "my salary is 15,000 a month",
    "I take home 15000 per month",
    "I get paid $15,000 monthly",
    "my income is 15000/month",
    "I make 15,000 a month",
  ]) {
    const r = parseDebtIntent(`debt payoff for 5000 at 20% min 100 — ${phrase}`);
    assert.equal(r.statedIncome, 15000, phrase);
    assert.equal(r.extraMonthly, null, phrase);
  }
});

test("capacity phrasings are still read as capacity", () => {
  for (const phrase of [
    "I can put $600/month toward it",
    "budget 600 per month",
    "I have 600 a month spare",
    "I can afford 600 monthly",
  ]) {
    const r = parseDebtIntent(`debt payoff for 5000 at 20% min 100 — ${phrase}`);
    assert.equal(r.extraMonthly, 600, phrase);
  }
});

test("both figures are kept when the user states income and capacity", () => {
  const r = parseDebtIntent(
    "pay off 5000 at 20% min 100. I earn 8000 per month and can put 600 a month toward it.",
  );
  assert.equal(r.statedIncome, 8000);
  assert.equal(r.extraMonthly, 600);
});

test("an unlabelled monthly figure funds nothing", () => {
  const r = parseDebtIntent("debt payoff for 5000 at 20% min 100, 900 per month");
  assert.equal(r.extraMonthly, null);
  assert.equal(r.statedIncome, null);
});
