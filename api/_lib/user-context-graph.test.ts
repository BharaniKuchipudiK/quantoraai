import test from "node:test";
import assert from "node:assert/strict";
import {
  activeUserContextNodes,
  normalizeUserContextGraph,
  userContextNodesForKey,
} from "./user-context-graph.js";

const NOW = "2026-08-19T04:00:00.000Z";

test("user context graph normalizes account-level facts with provenance and confidence", () => {
  const graph = normalizeUserContextGraph([
    {
      id: "cash-1",
      category: "financial_state",
      context_key: "FINANCE.LIQUID_CASH",
      value: { amount: 12345.678, currency: "sgd" },
      provenance: "connected_source",
      confidence: 0.97,
      status: "active",
      source_ref: "bank:aggregate",
      updated_at: NOW,
    },
  ]);

  assert.equal(graph.length, 1);
  assert.equal(graph[0].key, "finance.liquid_cash");
  assert.equal(graph[0].value.amount, 12345.68);
  assert.equal(graph[0].value.currency, "SGD");
  assert.equal(graph[0].provenance, "connected_source");
  assert.equal(graph[0].confidence, 0.97);
});

test("invalid keys and empty values never enter the context graph", () => {
  const graph = normalizeUserContextGraph([
    { id: "bad-1", category: "fact", key: "../other-user", value: { text: "x" } },
    { id: "bad-2", category: "fact", key: "profile.name", value: {} },
    { id: "ok-1", category: "fact", key: "profile.home_city", value: { text: "Singapore" }, provenance: "user", confidence: 1 },
  ]);

  assert.deepEqual(graph.map((node) => node.id), ["ok-1"]);
});

test("active context excludes superseded, expired, future and low-confidence nodes", () => {
  const graph = normalizeUserContextGraph([
    { id: "active", category: "preference", key: "travel.flight.direct", value: { boolean: true }, provenance: "user", confidence: 1, status: "active" },
    { id: "superseded", category: "preference", key: "travel.hotel.rating", value: { number: 5 }, provenance: "user", confidence: 1, status: "superseded" },
    { id: "expired", category: "constraint", key: "finance.trip_budget", value: { amount: 2000, currency: "SGD" }, provenance: "user", confidence: 1, status: "active", valid_until: "2026-08-18T00:00:00Z" },
    { id: "future", category: "commitment", key: "finance.commitment.future", value: { amount: 500, currency: "SGD" }, provenance: "user", confidence: 1, status: "active", valid_from: "2026-08-20T00:00:00Z" },
    { id: "weak", category: "fact", key: "profile.preference.guess", value: { text: "Maybe likes luxury" }, provenance: "inferred", confidence: 0.4, status: "active" },
  ]);

  assert.deepEqual(activeUserContextNodes(graph, { asOf: NOW }).map((node) => node.id), ["active"]);
});

test("prefix key lookup supports multiple commitments without flattening them into one fact", () => {
  const graph = normalizeUserContextGraph([
    { id: "tuition", category: "commitment", key: "finance.commitment.tuition", value: { amount: 4100, currency: "SGD", date: "2026-11-01T00:00:00Z" }, provenance: "user", confidence: 1, status: "active" },
    { id: "rent", category: "commitment", key: "finance.commitment.rent", value: { amount: 2500, currency: "SGD", date: "2026-09-01T00:00:00Z" }, provenance: "connected_source", confidence: 0.99, status: "active" },
  ]);

  assert.deepEqual(
    userContextNodesForKey(graph, "finance.commitment", { asOf: NOW, prefix: true }).map((node) => node.id),
    ["tuition", "rent"],
  );
});
