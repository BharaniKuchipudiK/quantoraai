import assert from "node:assert/strict";
import test from "node:test";

import { parseAdviceIntent, isProfileShowQuery, parseWhatIf, hasScenarioOpener } from "./finance-advisor-intent.js";

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

test("matches goal-probability questions (Monte Carlo trigger)", () => {
  for (const m of [
    "what are my chances of hitting my goal?",
    "what's the probability I reach my target?",
    "will I reach my retirement goal?",
    "am I on track?",
    "how likely am I to get there",
  ]) {
    assert.equal(parseAdviceIntent(m).matched, true, m);
  }
});

test("does not fire on a concrete calculation the specific engines own", () => {
  assert.equal(parseAdviceIntent("Convert 1000 USD to SGD").matched, false);
  assert.equal(parseAdviceIntent("Can I afford SGD 3,000?").matched, false);
  assert.equal(parseAdviceIntent("what's the weather").matched, false);
});

test("parses each what-if lever from a hypothetical", () => {
  assert.deepEqual(parseWhatIf("what if I add SGD 500 a month"), { addMonthly: 500 });
  assert.deepEqual(parseWhatIf("what if I save SGD 3,000/month"), { monthlyOverride: 3000 });
  assert.deepEqual(parseWhatIf("what if I retire in 25 years"), { horizonYears: 25 });
  assert.deepEqual(parseWhatIf("what if I go aggressive"), { risk: "aggressive" });
  assert.deepEqual(parseWhatIf("what if I switch to conservative"), { risk: "conservative" });
  assert.deepEqual(parseWhatIf("what if my goal were SGD 2M"), { goalOverride: 2_000_000 });
});

test("reads several levers from one hypothetical", () => {
  assert.deepEqual(
    parseWhatIf("what if I add 500/month and retire in 25 years"),
    { addMonthly: 500, horizonYears: 25 },
  );
});

test("does not fire without a hypothetical framing", () => {
  assert.equal(parseWhatIf("save 3000 a month"), null);
  assert.equal(parseWhatIf("how should I invest my savings?"), null);
  assert.equal(parseWhatIf("build me a plan"), null);
  assert.equal(parseWhatIf(""), null);
  assert.equal(parseWhatIf(null), null);
});

test("a hypothetical with no recognized lever is null (falls through to normal advice)", () => {
  assert.equal(parseWhatIf("what if the market crashes?"), null);
});

test("add-vs-replace is read from the monthly clause, not an unrelated lever", () => {
  // "increase" belongs to the horizon here — it must not turn the override into an add.
  assert.deepEqual(
    parseWhatIf("what if I contribute 3,000/month and increase my horizon to 25 years"),
    { monthlyOverride: 3000, horizonYears: 25 },
  );
});

test("a bare 'for N years' qualifies a contribution, not the plan horizon", () => {
  assert.deepEqual(parseWhatIf("what if I add SGD 500/month for 5 years"), { addMonthly: 500 });
});

test("hasScenarioOpener flags a strong hypothetical opener", () => {
  assert.equal(hasScenarioOpener("what if I save SGD 3,000/month and retire in 25 years"), true);
  assert.equal(hasScenarioOpener("suppose I go aggressive"), true);
  assert.equal(hasScenarioOpener("if I save 2000/month can I reach 500k in 10 years"), false);
  assert.equal(hasScenarioOpener("save 20000 in 3 years at 400/month"), false);
});

test("detects a profile read-back query", () => {
  assert.equal(isProfileShowQuery("show my profile"), true);
  assert.equal(isProfileShowQuery("what is my financial profile"), true);
  assert.equal(isProfileShowQuery("set my goal to SGD 100 in 5 years"), false);
});
