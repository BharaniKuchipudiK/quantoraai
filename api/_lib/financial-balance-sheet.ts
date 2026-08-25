/**
 * Financial balance sheet (ADR-025, Phase A) — the full financial picture a real
 * advisor reasons over: assets, liabilities, income, expenses, and the emergency
 * fund, captured explicitly and stored in the same user-context graph as the
 * profile. From these it derives net worth, monthly surplus, savings rate, and
 * emergency-fund coverage — all real arithmetic, nothing inferred.
 *
 * Same trust rule as the rest of Finance: only explicit, user-approved commands
 * are stored. Ordinary chat is never mined for a balance or a debt.
 */

import { parseExplicitMoney } from "./affordability-intent.js";
import {
  userContextNodesForKey,
  type UserContextCategory,
  type UserContextValue,
  type UserContextProvenance,
} from "./user-context-graph.js";

export const BALANCE_KEYS = {
  income: "finance.balance.income_monthly",
  expenses: "finance.balance.expenses_monthly",
  emergencyFund: "finance.balance.emergency_fund",
  liquidCash: "finance.liquid_cash", // shared with the affordability context
  assetPrefix: "finance.balance.asset",
  liabilityPrefix: "finance.balance.liability",
} as const;

export type BalanceSheetCommand =
  | { kind: "set_income"; amount: number; currency: string }
  | { kind: "set_expenses"; amount: number; currency: string }
  | { kind: "set_emergency_fund"; amount: number; currency: string }
  | { kind: "add_asset"; label: string; key: string; amount: number; currency: string }
  | { kind: "add_liability"; label: string; key: string; amount: number; currency: string; aprPct: number | null };

export type BalanceLine = { label: string; amount: number; currency: string; aprPct?: number | null };

export type BalanceSheet = {
  incomeMonthly: number | null;
  expensesMonthly: number | null;
  emergencyFund: number | null;
  liquidCash: number | null;
  assets: BalanceLine[];
  liabilities: BalanceLine[];
  currency: string | null; // the single currency, when everything shares one
  mixedCurrency: boolean; // true when amounts span >1 currency (net worth withheld)
  // Derived (null when the inputs aren't there):
  totalAssets: number | null;
  totalLiabilities: number | null;
  netWorth: number | null;
  monthlySurplus: number | null;
  savingsRatePct: number | null;
  emergencyMonths: number | null;
};

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "item";
}

function moneyCommand(
  kind: "set_income" | "set_expenses" | "set_emergency_fund",
  text: string,
): BalanceSheetCommand | null {
  const money = parseExplicitMoney(text);
  if (money.amount === null || !money.currency) return null;
  return { kind, amount: money.amount, currency: money.currency };
}

/** Parse one explicit balance-sheet command, or null. Deterministic, no inference. */
export function parseBalanceSheetCommand(message: unknown): BalanceSheetCommand | null {
  if (typeof message !== "string") return null;
  const text = message.trim();
  if (!text) return null;

  const income = text.match(/^(?:set|update)\s+my\s+(?:monthly\s+)?income\s+to\s+(.+)$/i);
  if (income) return moneyCommand("set_income", income[1]);

  const expenses = text.match(/^(?:set|update)\s+my\s+(?:monthly\s+)?(?:expenses|spending)\s+to\s+(.+)$/i);
  if (expenses) return moneyCommand("set_expenses", expenses[1]);

  const emergency = text.match(/^(?:set|update)\s+my\s+emergency\s+fund\s+to\s+(.+)$/i);
  if (emergency) return moneyCommand("set_emergency_fund", emergency[1]);

  const asset = text.match(/^add\s+asset\s*:\s*([^,]{1,80}),\s*(.+)$/i);
  if (asset) {
    const label = asset[1].trim();
    const money = parseExplicitMoney(asset[2]);
    if (!label || money.amount === null || !money.currency) return null;
    return { kind: "add_asset", label, key: `${BALANCE_KEYS.assetPrefix}.${slug(label)}`, amount: money.amount, currency: money.currency };
  }

  const liability = text.match(/^add\s+liability\s*:\s*([^,]{1,80}),\s*(.+)$/i);
  if (liability) {
    const label = liability[1].trim();
    const rest = liability[2];
    const money = parseExplicitMoney(rest);
    if (!label || money.amount === null || !money.currency) return null;
    const apr = rest.match(/\bat\s+([0-9]+(?:\.[0-9]+)?)\s*%/i);
    const aprPct = apr ? Number(apr[1]) : null;
    return {
      kind: "add_liability",
      label,
      key: `${BALANCE_KEYS.liabilityPrefix}.${slug(label)}`,
      amount: money.amount,
      currency: money.currency,
      aprPct: aprPct !== null && Number.isFinite(aprPct) ? aprPct : null,
    };
  }

  return null;
}

/** The context-graph node a balance-sheet command writes (owner supplied by caller). */
export function balanceNode(command: BalanceSheetCommand, requestId: string): {
  category: UserContextCategory;
  key: string;
  value: UserContextValue;
  provenance: UserContextProvenance;
  confidence: number;
  sourceRef: string;
} {
  const common = { provenance: "user" as const, confidence: 1, sourceRef: `chat-explicit:${requestId}` };
  if (command.kind === "add_asset") {
    return { ...common, category: "financial_state", key: command.key, value: { text: command.label, amount: command.amount, currency: command.currency } };
  }
  if (command.kind === "add_liability") {
    return {
      ...common,
      category: "commitment",
      key: command.key,
      value: { text: command.label, amount: command.amount, currency: command.currency, ...(command.aprPct !== null ? { number: command.aprPct } : {}) },
    };
  }
  const key = command.kind === "set_income" ? BALANCE_KEYS.income : command.kind === "set_expenses" ? BALANCE_KEYS.expenses : BALANCE_KEYS.emergencyFund;
  return { ...common, category: "financial_state", key, value: { amount: command.amount, currency: command.currency } };
}

function latest(graph: unknown, key: string) {
  return userContextNodesForKey(graph, key, { minConfidence: 0.5 })[0] || null;
}

function lines(graph: unknown, prefix: string): BalanceLine[] {
  return userContextNodesForKey(graph, prefix, { minConfidence: 0.5, prefix: true })
    .filter((n) => typeof n.value.amount === "number")
    .map((n) => ({
      label: n.value.text || n.key.split(".").pop() || "item",
      amount: n.value.amount as number,
      currency: n.value.currency || "",
      aprPct: typeof n.value.number === "number" ? n.value.number : null,
    }));
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/** Read the balance sheet from a context graph and derive net worth / cash-flow metrics. */
export function readBalanceSheet(graph: unknown): BalanceSheet {
  const incomeNode = latest(graph, BALANCE_KEYS.income);
  const expensesNode = latest(graph, BALANCE_KEYS.expenses);
  const emergencyNode = latest(graph, BALANCE_KEYS.emergencyFund);
  const liquidNode = latest(graph, BALANCE_KEYS.liquidCash);

  const incomeMonthly = typeof incomeNode?.value.amount === "number" ? incomeNode.value.amount : null;
  const expensesMonthly = typeof expensesNode?.value.amount === "number" ? expensesNode.value.amount : null;
  const emergencyFund = typeof emergencyNode?.value.amount === "number" ? emergencyNode.value.amount : null;
  const liquidCash = typeof liquidNode?.value.amount === "number" ? liquidNode.value.amount : null;
  const assets = lines(graph, BALANCE_KEYS.assetPrefix);
  const liabilities = lines(graph, BALANCE_KEYS.liabilityPrefix);

  // Determine whether everything shares a single currency — net worth is only
  // honest when it does; we never silently sum across currencies.
  const currencies = new Set<string>();
  for (const c of [incomeNode?.value.currency, expensesNode?.value.currency, emergencyNode?.value.currency, liquidNode?.value.currency]) {
    if (c) currencies.add(c);
  }
  for (const l of [...assets, ...liabilities]) if (l.currency) currencies.add(l.currency);
  const mixedCurrency = currencies.size > 1;
  const currency = currencies.size === 1 ? [...currencies][0] : null;

  const assetCashTotal = (liquidCash ?? 0) + (emergencyFund ?? 0) + assets.reduce((s, a) => s + a.amount, 0);
  const hasAssetInputs = liquidCash !== null || emergencyFund !== null || assets.length > 0;
  const totalAssets = hasAssetInputs && !mixedCurrency ? round2(assetCashTotal) : null;
  const totalLiabilities = liabilities.length && !mixedCurrency ? round2(liabilities.reduce((s, l) => s + l.amount, 0)) : null;
  const netWorth =
    !mixedCurrency && (totalAssets !== null || totalLiabilities !== null)
      ? round2((totalAssets ?? 0) - (totalLiabilities ?? 0))
      : null;

  const monthlySurplus = incomeMonthly !== null && expensesMonthly !== null ? round2(incomeMonthly - expensesMonthly) : null;
  const savingsRatePct = incomeMonthly && incomeMonthly > 0 && monthlySurplus !== null ? round2((monthlySurplus / incomeMonthly) * 100) : null;
  const emergencyMonths = emergencyFund !== null && expensesMonthly && expensesMonthly > 0 ? round2(emergencyFund / expensesMonthly) : null;

  return {
    incomeMonthly, expensesMonthly, emergencyFund, liquidCash, assets, liabilities,
    currency, mixedCurrency, totalAssets, totalLiabilities, netWorth, monthlySurplus, savingsRatePct, emergencyMonths,
  };
}

/** True when the balance sheet has no inputs at all. */
export function isBalanceSheetEmpty(bs: BalanceSheet): boolean {
  return (
    bs.incomeMonthly === null && bs.expensesMonthly === null && bs.emergencyFund === null &&
    bs.liquidCash === null && bs.assets.length === 0 && bs.liabilities.length === 0
  );
}

function fmt(amount: number, currency: string | null): string {
  return `${currency || ""} ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`.trim();
}

/** Human-readable balance-sheet summary. Empty inputs read as "not set". */
export function formatBalanceSheet(bs: BalanceSheet): string {
  if (isBalanceSheetEmpty(bs)) {
    return [
      "**Your balance sheet is empty.** Build the full picture so I can advise like a real planner — nothing is inferred:",
      "",
      ...BALANCE_SET_HINTS,
    ].join("\n");
  }

  const cur = bs.currency;
  const lines: string[] = ["**Your financial picture** (stored only because you set it):", ""];

  if (bs.incomeMonthly !== null) lines.push(`- **Income:** ${fmt(bs.incomeMonthly, cur)} / month`);
  if (bs.expensesMonthly !== null) lines.push(`- **Expenses:** ${fmt(bs.expensesMonthly, cur)} / month`);
  if (bs.monthlySurplus !== null) {
    const rate = bs.savingsRatePct !== null ? ` (${bs.savingsRatePct.toFixed(0)}% savings rate)` : "";
    lines.push(`- **Monthly surplus:** ${fmt(bs.monthlySurplus, cur)}${rate}`);
  }
  if (bs.liquidCash !== null) lines.push(`- **Liquid cash:** ${fmt(bs.liquidCash, cur)}`);
  if (bs.emergencyFund !== null) {
    const cover = bs.emergencyMonths !== null ? ` (~${bs.emergencyMonths.toFixed(1)} months of expenses)` : "";
    lines.push(`- **Emergency fund:** ${fmt(bs.emergencyFund, cur)}${cover}`);
  }
  for (const a of bs.assets) lines.push(`- **Asset — ${a.label}:** ${fmt(a.amount, a.currency)}`);
  for (const l of bs.liabilities) {
    const apr = l.aprPct != null ? ` at ${l.aprPct}%` : "";
    lines.push(`- **Liability — ${l.label}:** ${fmt(l.amount, l.currency)}${apr}`);
  }

  if (bs.mixedCurrency) {
    lines.push("", "_Your figures span more than one currency, so I won't sum a single net worth without an FX conversion — tell me a base currency and I can convert from the stored ECB rates._");
  } else if (bs.netWorth !== null) {
    lines.push("", `**Net worth: ${fmt(bs.netWorth, cur)}**  (assets ${fmt(bs.totalAssets ?? 0, cur)} − liabilities ${fmt(bs.totalLiabilities ?? 0, cur)})`);
  }

  return lines.join("\n");
}

export const BALANCE_SET_HINTS = [
  "- `Set my monthly income to SGD 8,000`",
  "- `Set my monthly expenses to SGD 4,500`",
  "- `Set my emergency fund to SGD 20,000`",
  "- `Set my liquid cash to SGD 15,000`",
  "- `Add asset: CPF, SGD 60,000`",
  "- `Add liability: car loan, SGD 25,000 at 3.5%`",
];
