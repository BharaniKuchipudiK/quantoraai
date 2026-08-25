import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFinancialProfileCommand,
  profileNode,
  readFinancialProfile,
  missingProfileFields,
  formatProfile,
  PROFILE_KEYS,
} from "./financial-profile.js";

test("parses a goal with an 'in N years' horizon", () => {
  const c = parseFinancialProfileCommand("Set my goal to SGD 1,000,000 in 20 years");
  assert.deepEqual(c, { kind: "set_goal", amount: 1_000_000, currency: "SGD", horizonYears: 20 });
});

test("parses a goal with a 'by YYYY' target into a horizon", () => {
  const c = parseFinancialProfileCommand("set my goal to USD 500,000 by 2036", new Date("2026-01-01T00:00:00Z"));
  assert.equal(c?.kind, "set_goal");
  if (c?.kind === "set_goal") assert.equal(c.horizonYears, 10);
});

test("parses risk, horizon, and monthly commands", () => {
  assert.deepEqual(parseFinancialProfileCommand("Set my risk tolerance to moderate"), { kind: "set_risk", risk: "moderate" });
  assert.deepEqual(parseFinancialProfileCommand("set my risk appetite to aggressive"), { kind: "set_risk", risk: "aggressive" });
  assert.deepEqual(parseFinancialProfileCommand("Set my time horizon to 15 years"), { kind: "set_horizon", horizonYears: 15 });
  assert.deepEqual(parseFinancialProfileCommand("Set my monthly investment to SGD 2,000"), {
    kind: "set_monthly_investable", amount: 2000, currency: "SGD",
  });
});

test("does not match ordinary chat or an unknown risk word", () => {
  assert.equal(parseFinancialProfileCommand("what do you think about stocks?"), null);
  assert.equal(parseFinancialProfileCommand("set my risk tolerance to spicy"), null);
  assert.equal(parseFinancialProfileCommand("set my goal to be rich"), null, "no explicit money -> null");
});

test("profileNode carries user provenance and the right key/category", () => {
  const node = profileNode({ kind: "set_goal", amount: 1_000_000, currency: "SGD", horizonYears: 20 }, "req-1");
  assert.equal(node.key, PROFILE_KEYS.goal);
  assert.equal(node.category, "goal");
  assert.equal(node.provenance, "user");
  assert.equal(node.confidence, 1);
  assert.equal(node.value.amount, 1_000_000);
  assert.equal(node.value.number, 20, "horizon rides on the goal");
});

function node(key: string, value: Record<string, unknown>, category = "fact") {
  return { id: `${key}-1`, category, key, value, provenance: "user", confidence: 1, status: "active" };
}

test("reads a full profile back from a context graph, preferring the goal's horizon", () => {
  const graph = [
    node(PROFILE_KEYS.goal, { amount: 1_000_000, currency: "SGD", number: 20 }, "goal"),
    node(PROFILE_KEYS.risk, { text: "moderate" }, "preference"),
    node(PROFILE_KEYS.monthly, { amount: 2000, currency: "SGD" }, "financial_state"),
  ];
  const profile = readFinancialProfile(graph);
  assert.deepEqual(profile, {
    goalAmount: 1_000_000,
    goalCurrency: "SGD",
    horizonYears: 20,
    riskTolerance: "moderate",
    monthlyInvestable: 2000,
    monthlyCurrency: "SGD",
  });
  assert.deepEqual(missingProfileFields(profile), []);
});

test("missing fields are reported and surfaced with set-commands", () => {
  const profile = readFinancialProfile([node(PROFILE_KEYS.goal, { amount: 100000, currency: "USD" }, "goal")]);
  const missing = missingProfileFields(profile);
  assert.ok(missing.includes("horizon"));
  assert.ok(missing.includes("risk tolerance"));
  assert.ok(missing.includes("monthly investable"));
  const text = formatProfile(profile);
  assert.match(text, /Still to set/);
  assert.match(text, /Set my risk tolerance/);
});
