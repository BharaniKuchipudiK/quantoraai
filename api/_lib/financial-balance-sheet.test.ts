import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBalanceSheetCommand,
  balanceNode,
  readBalanceSheet,
  formatBalanceSheet,
  isBalanceSheetEmpty,
  BALANCE_KEYS,
} from "./financial-balance-sheet.js";

test("parses income / expenses / emergency-fund commands", () => {
  assert.deepEqual(parseBalanceSheetCommand("Set my monthly income to SGD 8,000"), { kind: "set_income", amount: 8000, currency: "SGD" });
  assert.deepEqual(parseBalanceSheetCommand("set my expenses to SGD 4,500"), { kind: "set_expenses", amount: 4500, currency: "SGD" });
  assert.deepEqual(parseBalanceSheetCommand("Set my emergency fund to SGD 20,000"), { kind: "set_emergency_fund", amount: 20000, currency: "SGD" });
});

test("parses add asset / add liability, capturing an optional APR", () => {
  const asset = parseBalanceSheetCommand("Add asset: CPF, SGD 60,000");
  assert.equal(asset?.kind, "add_asset");
  if (asset?.kind === "add_asset") { assert.equal(asset.label, "CPF"); assert.equal(asset.amount, 60000); assert.match(asset.key, /^finance\.balance\.asset\./); }

  const liab = parseBalanceSheetCommand("add liability: car loan, SGD 25,000 at 3.5%");
  assert.equal(liab?.kind, "add_liability");
  if (liab?.kind === "add_liability") { assert.equal(liab.amount, 25000); assert.equal(liab.aprPct, 3.5); }

  const noApr = parseBalanceSheetCommand("add liability: family loan, SGD 5,000");
  assert.equal(noApr?.kind, "add_liability");
  if (noApr?.kind === "add_liability") assert.equal(noApr.aprPct, null);
});

test("ignores ordinary chat and money without a currency", () => {
  assert.equal(parseBalanceSheetCommand("how's the market?"), null);
  assert.equal(parseBalanceSheetCommand("set my monthly income to a lot"), null);
});

test("balanceNode carries user provenance and a liability's APR", () => {
  const node = balanceNode({ kind: "add_liability", label: "car", key: "finance.balance.liability.car", amount: 25000, currency: "SGD", aprPct: 3.5 }, "req");
  assert.equal(node.provenance, "user");
  assert.equal(node.category, "commitment");
  assert.equal(node.value.number, 3.5);
});

function node(key: string, value: Record<string, unknown>, category = "financial_state") {
  return { id: key, category, key, value, provenance: "user", confidence: 1, status: "active" };
}

test("derives net worth, surplus, savings rate and emergency coverage", () => {
  const graph = [
    node(BALANCE_KEYS.income, { amount: 8000, currency: "SGD" }),
    node(BALANCE_KEYS.expenses, { amount: 4500, currency: "SGD" }),
    node(BALANCE_KEYS.emergencyFund, { amount: 18000, currency: "SGD" }),
    node(BALANCE_KEYS.liquidCash, { amount: 15000, currency: "SGD" }),
    node(`${BALANCE_KEYS.assetPrefix}.cpf`, { text: "CPF", amount: 60000, currency: "SGD" }),
    node(`${BALANCE_KEYS.liabilityPrefix}.car`, { text: "car loan", amount: 25000, currency: "SGD", number: 3.5 }, "commitment"),
  ];
  const bs = readBalanceSheet(graph);
  assert.equal(bs.totalAssets, 93000, "15k cash + 18k emergency + 60k CPF");
  assert.equal(bs.totalLiabilities, 25000);
  assert.equal(bs.netWorth, 68000);
  assert.equal(bs.monthlySurplus, 3500);
  assert.equal(bs.savingsRatePct, 43.75);
  assert.equal(bs.emergencyMonths, 4);
  assert.equal(bs.mixedCurrency, false);
  assert.equal(bs.currency, "SGD");
  const text = formatBalanceSheet(bs);
  assert.match(text, /Net worth: SGD 68,000/);
});

test("withholds a single net worth across mixed currencies", () => {
  const graph = [
    node(BALANCE_KEYS.liquidCash, { amount: 15000, currency: "SGD" }),
    node(`${BALANCE_KEYS.assetPrefix}.us_broker`, { text: "US brokerage", amount: 40000, currency: "USD" }),
  ];
  const bs = readBalanceSheet(graph);
  assert.equal(bs.mixedCurrency, true);
  assert.equal(bs.netWorth, null, "never sum across currencies silently");
  assert.match(formatBalanceSheet(bs), /won't sum a single net worth/);
});

test("an empty graph reads as an empty balance sheet with set-hints", () => {
  const bs = readBalanceSheet([]);
  assert.equal(isBalanceSheetEmpty(bs), true);
  assert.match(formatBalanceSheet(bs), /balance sheet is empty/);
});
