/**
 * Financial profile (ADR-025, Step 2a) — the user's investment intent, captured
 * explicitly and stored in the existing user-context graph, then read back by the
 * advisor synthesis. This is the "memory" that turns isolated calculators into an
 * advisor that knows the person.
 *
 * Same trust rule as the affordability context commands: V1 accepts only
 * explicit, user-approved commands. Ordinary chat is never mined for a goal or a
 * risk appetite — a profile fact exists only because the user stated it.
 */

import { parseExplicitMoney } from "./affordability-intent.js";
import {
  userContextNodesForKey,
  type UserContextCategory,
  type UserContextValue,
  type UserContextProvenance,
} from "./user-context-graph.js";

export type RiskTolerance = "conservative" | "moderate" | "aggressive";

export const PROFILE_KEYS = {
  goal: "finance.profile.goal",
  risk: "finance.profile.risk_tolerance",
  horizon: "finance.profile.horizon_years",
  monthly: "finance.profile.monthly_investable",
} as const;

export type FinancialProfileCommand =
  | { kind: "set_goal"; amount: number; currency: string; horizonYears: number | null }
  | { kind: "set_risk"; risk: RiskTolerance }
  | { kind: "set_horizon"; horizonYears: number }
  | { kind: "set_monthly_investable"; amount: number; currency: string };

export type FinancialProfile = {
  goalAmount: number | null;
  goalCurrency: string | null;
  horizonYears: number | null;
  riskTolerance: RiskTolerance | null;
  monthlyInvestable: number | null;
  monthlyCurrency: string | null;
};

const RISK_WORDS: Record<string, RiskTolerance> = {
  conservative: "conservative",
  cautious: "conservative",
  low: "conservative",
  moderate: "moderate",
  balanced: "moderate",
  medium: "moderate",
  aggressive: "aggressive",
  growth: "aggressive",
  high: "aggressive",
};

function years(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n);
}

function yearsToTarget(targetYear: string, now: Date): number | null {
  const y = Number(targetYear);
  if (!Number.isFinite(y)) return null;
  const diff = y - now.getUTCFullYear();
  return diff > 0 && diff <= 100 ? diff : null;
}

/** Parse one explicit financial-profile command, or null. Deterministic, no inference. */
export function parseFinancialProfileCommand(message: unknown, now: Date = new Date()): FinancialProfileCommand | null {
  if (typeof message !== "string") return null;
  const text = message.trim();
  if (!text) return null;

  // Goal: "set my goal to SGD 1,000,000 in 20 years" | "... by 2046"
  const goal = text.match(/^(?:set|update)\s+my\s+(?:investment\s+|financial\s+|retirement\s+)?goal\s+to\s+(.+)$/i);
  if (goal) {
    const rest = goal[1];
    const money = parseExplicitMoney(rest);
    if (money.amount === null || !money.currency) return null;
    let horizonYears: number | null = null;
    const inYears = rest.match(/\bin\s+(\d{1,3})\s*years?\b/i);
    const byYear = rest.match(/\bby\s+(\d{4})\b/i);
    if (inYears) horizonYears = years(inYears[1]);
    else if (byYear) horizonYears = yearsToTarget(byYear[1], now);
    return { kind: "set_goal", amount: money.amount, currency: money.currency, horizonYears };
  }

  // Risk: "set my risk tolerance to moderate"
  const risk = text.match(/^(?:set|update)\s+my\s+risk\s+(?:tolerance|appetite|profile)\s+to\s+([a-z]+)\b/i);
  if (risk) {
    const mapped = RISK_WORDS[risk[1].toLowerCase()];
    return mapped ? { kind: "set_risk", risk: mapped } : null;
  }

  // Horizon: "set my time horizon to 10 years"
  const horizon = text.match(/^(?:set|update)\s+my\s+(?:time\s+|investment\s+)?horizon\s+to\s+(\d{1,3})\s*years?\b/i);
  if (horizon) {
    const y = years(horizon[1]);
    return y ? { kind: "set_horizon", horizonYears: y } : null;
  }

  // Monthly investable: "set my monthly investment to SGD 2,000"
  const monthly = text.match(/^(?:set|update)\s+my\s+monthly\s+(?:investment|investable|contribution|savings?)\s+to\s+(.+)$/i);
  if (monthly) {
    const money = parseExplicitMoney(monthly[1]);
    if (money.amount === null || !money.currency) return null;
    return { kind: "set_monthly_investable", amount: money.amount, currency: money.currency };
  }

  return null;
}

/** The context-graph node a profile command writes (owner is supplied by the caller). */
export function profileNode(command: FinancialProfileCommand, requestId: string): {
  category: UserContextCategory;
  key: string;
  value: UserContextValue;
  provenance: UserContextProvenance;
  confidence: number;
  sourceRef: string;
} {
  const common = { provenance: "user" as const, confidence: 1, sourceRef: `chat-explicit:${requestId}` };
  if (command.kind === "set_goal") {
    return {
      ...common,
      category: "goal",
      key: PROFILE_KEYS.goal,
      value: {
        amount: command.amount,
        currency: command.currency,
        ...(command.horizonYears ? { number: command.horizonYears } : {}),
      },
    };
  }
  if (command.kind === "set_risk") {
    return { ...common, category: "preference", key: PROFILE_KEYS.risk, value: { text: command.risk } };
  }
  if (command.kind === "set_horizon") {
    return { ...common, category: "preference", key: PROFILE_KEYS.horizon, value: { number: command.horizonYears } };
  }
  return {
    ...common,
    category: "financial_state",
    key: PROFILE_KEYS.monthly,
    value: { amount: command.amount, currency: command.currency },
  };
}

function latestForKey(graph: unknown, key: string) {
  // The store returns nodes newest-first; userContextNodesForKey preserves that order.
  return userContextNodesForKey(graph, key, { minConfidence: 0.5 })[0] || null;
}

/** Read the current profile from a context graph. Missing fields come back null. */
export function readFinancialProfile(graph: unknown): FinancialProfile {
  const goal = latestForKey(graph, PROFILE_KEYS.goal);
  const risk = latestForKey(graph, PROFILE_KEYS.risk);
  const horizon = latestForKey(graph, PROFILE_KEYS.horizon);
  const monthly = latestForKey(graph, PROFILE_KEYS.monthly);

  const riskText = risk?.value.text as RiskTolerance | undefined;
  return {
    goalAmount: typeof goal?.value.amount === "number" ? goal.value.amount : null,
    goalCurrency: goal?.value.currency || null,
    // Prefer a horizon carried on the goal; fall back to a standalone horizon.
    horizonYears:
      typeof goal?.value.number === "number"
        ? goal.value.number
        : typeof horizon?.value.number === "number"
          ? horizon.value.number
          : null,
    riskTolerance: riskText === "conservative" || riskText === "moderate" || riskText === "aggressive" ? riskText : null,
    monthlyInvestable: typeof monthly?.value.amount === "number" ? monthly.value.amount : null,
    monthlyCurrency: monthly?.value.currency || null,
  };
}

/** Which required fields are still unset (goal, horizon, risk, monthly). */
export function missingProfileFields(profile: FinancialProfile): string[] {
  const missing: string[] = [];
  if (profile.goalAmount === null) missing.push("goal");
  if (profile.horizonYears === null) missing.push("horizon");
  if (profile.riskTolerance === null) missing.push("risk tolerance");
  if (profile.monthlyInvestable === null) missing.push("monthly investable");
  return missing;
}

const SET_HINTS = [
  "- `Set my goal to SGD 1,000,000 in 20 years`",
  "- `Set my risk tolerance to moderate` (conservative / moderate / aggressive)",
  "- `Set my time horizon to 20 years` (optional if your goal already has one)",
  "- `Set my monthly investment to SGD 2,000`",
];

/** Human-readable profile summary, with the exact commands to fill any gaps. */
export function formatProfile(profile: FinancialProfile): string {
  const line = (label: string, value: string | null) => `- **${label}:** ${value ?? "_not set_"}`;
  const money = (amount: number | null, currency: string | null) =>
    amount === null ? null : `${currency || ""} ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`.trim();

  const missing = missingProfileFields(profile);
  const lines = [
    "**Your financial profile** (stored only because you set it — never inferred):",
    "",
    line("Goal", money(profile.goalAmount, profile.goalCurrency)),
    line("Horizon", profile.horizonYears ? `${profile.horizonYears} years` : null),
    line("Risk tolerance", profile.riskTolerance),
    line("Monthly investable", money(profile.monthlyInvestable, profile.monthlyCurrency)),
  ];
  if (missing.length) {
    lines.push("", `Still to set: **${missing.join(", ")}**.`, "", ...SET_HINTS);
  } else {
    lines.push("", "Your profile is complete — ask me to **build a plan** and I'll ground it in these numbers.");
  }
  return lines.join("\n");
}

export { SET_HINTS as PROFILE_SET_HINTS };
