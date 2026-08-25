import assert from "node:assert/strict";
import test from "node:test";

import { parseDebtCrisisIntent, parseConsolidationOffer } from "./debt-crisis-intent.js";

test("matches consolidation / crisis / bridge-the-gap phrasings", () => {
  for (const m of [
    "help me with debt consolidation",
    "can we consolidate my debts",
    "bridge the gap between my salary and my debt",
    "how do I manage my debt",
    "I can't cover my minimum payments",
    "restructure my loans",
    "how do I get out of debt",
  ]) {
    assert.equal(parseDebtCrisisIntent(m).matched, true, m);
  }
});

test("does not fire on ordinary finance chat or a plain payoff line", () => {
  assert.equal(parseDebtCrisisIntent("what's the USD to SGD rate?").matched, false);
  assert.equal(parseDebtCrisisIntent("save $20,000 in 3 years").matched, false);
});

test("pulls a concrete consolidation offer out of the message", () => {
  assert.deepEqual(parseConsolidationOffer("consolidate at 10.5% over 60 months"), { ratePct: 10.5, termMonths: 60 });
  assert.deepEqual(parseConsolidationOffer("a loan at 8% for 5 years"), { ratePct: 8, termMonths: 60 });
  assert.equal(parseConsolidationOffer("consolidate my debts please"), null, "no rate/term -> no offer");

  const withOffer = parseDebtCrisisIntent("consolidate my debt at 9% over 48 months");
  assert.equal(withOffer.matched, true);
  assert.deepEqual(withOffer.offer, { ratePct: 9, termMonths: 48 });
});
