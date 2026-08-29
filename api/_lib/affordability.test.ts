import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAffordability} from "./affordability.js";
import { normalizeUserContextGraph } from "./user-context-graph.js";

const AS_OF = "2026-08-19T00:00:00.000Z";
const COVERAGE_DATE = "2026-11-30T00:00:00.000Z";

function node(
  id: string,
  category: "financial_state" | "constraint" | "commitment",
  key: string,
  amount: number,
  date?: string,
) {
  return {
    id,
    category,
    key,
    value: { amount, currency: "SGD", ...(date ? { date } : {}) },
    provenance: "user",
    confidence: 1,
    status: "active",
    updatedAt: AS_OF,
  };
}

function coverage(date = COVERAGE_DATE) {
  return {
    id: "coverage",
    category: "fact",
    key: "finance.commitments_reviewed_through",
    value: { date },
    provenance: "user",
    confidence: 1,
    status: "active",
    updatedAt: AS_OF,
  };
}

test("comfortable purchase is computed from cash + dated inflows - commitments - reserve", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 12000),
    node("reserve", "constraint", "finance.minimum_reserve", 3000),
    node("salary", "financial_state", "finance.expected_inflow.salary", 5000, "2026-09-01T00:00:00Z"),
    node("tuition", "commitment", "finance.commitment.tuition", 4000, "2026-10-01T00:00:00Z"),
    coverage(),
  ]);

  const decision = evaluateAffordability({
    graph,
    proposedCost: 3000,
    currency: "SGD",
    asOf: AS_OF,
    horizonDays: 90,
  });

  assert.equal(decision.safeSpend, 10000);
  assert.equal(decision.headroom, 7000);
  assert.equal(decision.verdict, "comfortable");
  assert.deepEqual(new Set(decision.consideredNodeIds), new Set(["cash", "reserve", "salary", "tuition", "coverage"]));
});

test("proposal near the safe-spend ceiling is possible but tight", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 10000),
    node("reserve", "constraint", "finance.minimum_reserve", 2000),
    coverage(),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 7000, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.safeSpend, 8000);
  assert.equal(decision.verdict, "possible_but_tight");
  assert.equal(decision.headroom, 1000);
});

test("proposal above the safe-spend ceiling is not affordable", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 6000),
    node("reserve", "constraint", "finance.minimum_reserve", 2500),
    node("rent", "commitment", "finance.commitment.rent", 1500, "2026-09-01T00:00:00Z"),
    coverage(),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 3000, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.safeSpend, 2000);
  assert.equal(decision.verdict, "not_affordable");
  assert.equal(decision.headroom, -1000);
});

test("unknown-date inflows do not optimistically increase safe spend", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 5000),
    node("reserve", "constraint", "finance.minimum_reserve", 2000),
    node("bonus", "financial_state", "finance.expected_inflow.bonus", 10000),
    coverage(),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 2500, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.expectedInflows, 0);
  assert.equal(decision.safeSpend, 3000);
  assert.equal(decision.verdict, "possible_but_tight");
});

test("unknown-date commitments are included conservatively", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 8000),
    node("reserve", "constraint", "finance.minimum_reserve", 2000),
    node("debt", "commitment", "finance.commitment.debt", 2500),
    coverage(),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 4000, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.commitments, 2500);
  assert.equal(decision.safeSpend, 3500);
  assert.equal(decision.verdict, "not_affordable");
});

test("foreign-currency commitments fail closed until Quantora has an FX conversion", () => {
  const usdCommitment = node("usd-debt", "commitment", "finance.commitment.usd_debt", 1000, "2026-09-15T00:00:00Z");
  usdCommitment.value.currency = "USD";
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 10000),
    node("reserve", "constraint", "finance.minimum_reserve", 2000),
    usdCommitment,
    coverage(),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 2000, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.verdict, "insufficient_data");
  assert.equal(decision.safeSpend, null);
  assert.match(decision.missing.join(" "), /currency conversion/);
  assert.ok(decision.consideredNodeIds.includes("usd-debt"));
});

test("absence of commitments is not treated as zero without coverage", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 10000),
    node("reserve", "constraint", "finance.minimum_reserve", 2000),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 2000, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.verdict, "insufficient_data");
  assert.equal(decision.safeSpend, null);
  assert.match(decision.missing.join(" "), /commitments_reviewed_through/);
});

test("stale commitment coverage fails closed when it does not reach the horizon", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 10000),
    node("reserve", "constraint", "finance.minimum_reserve", 2000),
    coverage("2026-09-30T00:00:00Z"),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 2000, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.verdict, "insufficient_data");
  assert.match(decision.missing.join(" "), />= 2026-11-17/);
});

test("portfolio-like context is ignored unless it is explicitly liquid cash", () => {
  const graph = normalizeUserContextGraph([
    node("cash", "financial_state", "finance.liquid_cash", 4000),
    node("reserve", "constraint", "finance.minimum_reserve", 3000),
    node("portfolio", "financial_state", "finance.portfolio_value", 100000),
    coverage(),
  ]);

  const decision = evaluateAffordability({ graph, proposedCost: 2000, currency: "SGD", asOf: AS_OF });
  assert.equal(decision.safeSpend, 1000);
  assert.equal(decision.verdict, "not_affordable");
  assert.ok(!decision.consideredNodeIds.includes("portfolio"));
});
