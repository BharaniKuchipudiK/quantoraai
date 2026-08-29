import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFinanceStabilityRouting,
  formatFinanceDirective,
  interpretFinanceTurn,
  publicFinanceRoutingMetadata,
} from "./finance-model-routing.js";

const base = {
  primaryModelId: "gemini-flash-latest",
  fallbackModelIds: ["free/one", "paid/two"],
  reason: "base",
  provider: "gemini" as const,
  hasVisionSupport: true,
  selectionSource: "base",
};

const MODELS = [
  { id: "gemini-flash-latest", pricingKind: "free-tier", quality: { sampleSize: 10, score: 40 } },
  { id: "free/one", pricingKind: "free", quality: { sampleSize: 10, score: 90 } },
  { id: "paid/two", pricingKind: "paid", quality: { sampleSize: 10, score: 100 } },
];

test("every other workspace passes through untouched", () => {
  for (const domain of ["travel", "education", "coding", "research", null, undefined]) {
    assert.equal(interpretFinanceTurn({ studioDomain: domain, message: "should I buy Apple stock?" }), null, String(domain));
  }
});

test("regulated territory is recognised and named", () => {
  for (const message of [
    "should I buy Apple stock?",
    "which fund should I put my savings in?",
    "give me tax planning advice",
    "is Tesla a good investment right now?",
  ]) {
    const i = interpretFinanceTurn({ studioDomain: "finance", message });
    assert.equal(i?.kind, "regulated", message);
    assert.equal(i?.mustNameLimits, true, message);
    const directive = formatFinanceDirective(i);
    assert.match(directive, /does not recommend/);
    assert.match(directive, /licensed adviser, accountant or credit counsellor/);
  }
});

test("a document turn demands strict format and the coldest temperature", () => {
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "build me an Excel model of this" });
  assert.equal(i?.kind, "document");
  assert.equal(i?.requiresStrictFormat, true);
  assert.equal(i?.temperatureCeiling, 0.1);
});

test("a number supplied in reply to the desk is intake, not a fresh question", () => {
  const i = interpretFinanceTurn({
    studioDomain: "finance",
    message: "I can put 600 a month toward it",
    history: [{ sender: "ai", text: "Where do those payments sit against your month?" }],
  });
  assert.equal(i?.kind, "intake");
  assert.match(formatFinanceDirective(i), /Do not restate what they already told you/);
});

test("a bare monthly figure with no financial conversation behind it is not intake", () => {
  const i = interpretFinanceTurn({
    studioDomain: "finance",
    message: "I have 3 meetings a month",
    history: [],
  });
  assert.equal(i?.kind, "education");
  assert.equal(formatFinanceDirective(i), "");
});

test("the router reorders the ladder and never invents a model", () => {
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "how does debt affect my credit score?" });
  const decision = applyFinanceStabilityRouting({ interpretation: i, baseDecision: base, models: MODELS });
  const ladder = [decision.primaryModelId, ...decision.fallbackModelIds].sort();
  assert.deepEqual(ladder, ["free/one", "gemini-flash-latest", "paid/two"]);
});

test("a free primary is NEVER moved onto a paid route", () => {
  // paid/two scores highest on measured quality. It still must not win, because
  // a more fluent narration of pre-computed numbers is not worth money.
  const paidWins = [
    { id: "gemini-flash-latest", pricingKind: "free-tier", quality: { sampleSize: 10, score: 10 } },
    { id: "free/one", pricingKind: "free", quality: { sampleSize: 10, score: 20 } },
    { id: "paid/two", pricingKind: "paid", quality: { sampleSize: 10, score: 100 } },
  ];
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "explain compound interest" });
  const decision = applyFinanceStabilityRouting({ interpretation: i, baseDecision: base, models: paidWins });
  assert.equal(decision.primaryModelId, base.primaryModelId);
  assert.equal(decision.selectionSource, "base", "the base decision must stand unchanged");
});

test("a model the user chose is never overridden", () => {
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "explain compound interest" });
  const decision = applyFinanceStabilityRouting({
    interpretation: i, baseDecision: base, models: MODELS, explicitModelSelected: true,
  });
  assert.equal(decision, base);
});

test("a coding specialist is pushed down for money narration", () => {
  const withCoder = {
    ...base,
    primaryModelId: "vendor/big-coder",
    fallbackModelIds: ["free/one"],
  };
  const models = [
    { id: "vendor/big-coder", name: "Big Coder", pricingKind: "free", quality: { sampleSize: 10, score: 80 } },
    { id: "free/one", pricingKind: "free", quality: { sampleSize: 10, score: 80 } },
  ];
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "explain compound interest" });
  const decision = applyFinanceStabilityRouting({ interpretation: i, baseDecision: withCoder, models });
  assert.equal(decision.primaryModelId, "free/one");
  assert.equal(decision.selectionSource, "finance_stability_route");
});

test("provider and vision are recomputed from the new primary, never inherited", () => {
  const fromGemini = { ...base, primaryModelId: "gemini-flash-latest", fallbackModelIds: ["free/one"] };
  const models = [
    { id: "gemini-flash-latest", pricingKind: "free-tier", quality: { sampleSize: 10, score: 10 } },
    { id: "free/one", pricingKind: "free", quality: { sampleSize: 10, score: 90 } },
  ];
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "explain compound interest" });
  const decision = applyFinanceStabilityRouting({ interpretation: i, baseDecision: fromGemini, models });
  assert.equal(decision.primaryModelId, "free/one");
  assert.equal(decision.provider, "openrouter");
  assert.equal(decision.hasVisionSupport, false, "inherited from the old Gemini primary would be wrong");
});

test("a one-model ladder has nothing to reorder", () => {
  const single = { ...base, fallbackModelIds: [] };
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "explain compound interest" });
  assert.equal(applyFinanceStabilityRouting({ interpretation: i, baseDecision: single, models: MODELS }), single);
});

test("diagnostics never carry the user's numbers", () => {
  const i = interpretFinanceTurn({ studioDomain: "finance", message: "I earn 15000 a month and owe 400000" });
  const meta = publicFinanceRoutingMetadata(i);
  assert.doesNotMatch(JSON.stringify(meta), /15000|400000/);
  assert.equal(publicFinanceRoutingMetadata(null), null);
});
