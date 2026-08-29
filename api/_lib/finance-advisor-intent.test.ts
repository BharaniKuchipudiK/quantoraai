import assert from "node:assert/strict";
import test from "node:test";

import { parseAdviceIntent, isProfileShowQuery } from "./finance-advisor-intent.js";

test("matches open requests for a plan or guidance", () => {
  for (const m of [
    "build me a financial plan",
    "help me plan for retirement",
    "how should I invest my savings?",
    "what should I do with my money?",
    "build me a portfolio",
    "give me a wealth plan",
    "can you advise me on investing?",
  ]) {
    assert.equal(parseAdviceIntent(m).matched, true, m);
  }
});

test("does not fire on a concrete calculation the specific engines own", () => {
  assert.equal(parseAdviceIntent("Convert 1000 USD to SGD").matched, false);
  assert.equal(parseAdviceIntent("Can I afford SGD 3,000?").matched, false);
  assert.equal(parseAdviceIntent("what's the weather").matched, false);
});

test("detects a profile read-back query", () => {
  assert.equal(isProfileShowQuery("show my profile"), true);
  assert.equal(isProfileShowQuery("what is my financial profile"), true);
  assert.equal(isProfileShowQuery("set my goal to SGD 100 in 5 years"), false);
});
