import test from "node:test";
import assert from "node:assert/strict";
import { endOfUtcDay, parseFinancialContextCommand } from "./financial-context-command.js";

test("parses explicit liquid cash update", () => {
  assert.deepEqual(
    parseFinancialContextCommand("Set my liquid cash to SGD 12,500"),
    { kind: "set_liquid_cash", amount: 12500, currency: "SGD" },
  );
});

test("parses explicit reserve update", () => {
  assert.deepEqual(
    parseFinancialContextCommand("Update my minimum reserve to SGD 3k"),
    { kind: "set_minimum_reserve", amount: 3000, currency: "SGD" },
  );
});

test("parses a dated commitment into a stable key", () => {
  assert.deepEqual(
    parseFinancialContextCommand("Add commitment: Daughter tuition, SGD 4,000, due 2026-10-01"),
    {
      kind: "add_commitment",
      label: "Daughter tuition",
      key: "finance.commitment.daughter_tuition.20261001",
      amount: 4000,
      currency: "SGD",
      dueDate: "2026-10-01",
    },
  );
});

test("parses commitment review coverage", () => {
  assert.deepEqual(
    parseFinancialContextCommand("Commitments reviewed through 2026-11-30"),
    { kind: "set_commitments_reviewed_through", reviewedThrough: "2026-11-30" },
  );
  assert.equal(endOfUtcDay("2026-11-30"), "2026-11-30T23:59:59.999Z");
});

test("invalid calendar dates and ambiguous dollars fail closed", () => {
  assert.equal(parseFinancialContextCommand("Commitments reviewed through 2026-02-30"), null);
  assert.equal(parseFinancialContextCommand("Set my liquid cash to $12,000"), null);
});

test("ordinary conversation is never silently captured as financial context", () => {
  assert.equal(parseFinancialContextCommand("I think I have about SGD 12,000 around somewhere"), null);
  assert.equal(parseFinancialContextCommand("What reserve should I keep?"), null);
});
