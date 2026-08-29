/**
 * Advisor synthesis (ADR-025, Step 2b) — the layer that turns stored facts into
 * a grounded plan. It composes the user's explicit profile with the deterministic
 * savings engine to answer: is the goal reachable at the stated pace, and what is
 * a sensible starting framework for the stated risk and horizon.
 *
 * The honest boundary, enforced here in code, not just prose:
 *  - Goal feasibility is real arithmetic (projectSavings), under a clearly
 *    LABELED return assumption — never a prediction of actual returns.
 *  - The allocation is a generic, risk-based STARTING FRAMEWORK, explicitly not
 *    personalized investment advice and not a recommendation of any security.
 *  - With an incomplete profile it refuses to advise and asks for the missing
 *    facts, rather than inventing them.
 */

import { projectSavings, type SavingsProjection } from "./savings-goal.js";
import {
  type FinancialProfile,
  type RiskTolerance,
  missingProfileFields,
  PROFILE_SET_HINTS,
} from "./financial-profile.js";
import type { BalanceSheet } from "./financial-balance-sheet.js";

// A liability at or above this APR is worth clearing before investing — a
// guaranteed saved rate almost always beats an assumed market return.
const HIGH_INTEREST_APR = 8;
// Below this many months of expenses, the emergency fund comes first.
const MIN_EMERGENCY_MONTHS = 3;

// LABELED planning assumptions — long-run nominal figures used only to test
// feasibility. They are assumptions the user can change, not forecasts.
const ASSUMED_RETURN_PCT: Record<RiskTolerance, number> = {
  conservative: 3,
  moderate: 5,
  aggressive: 7,
};

// Generic starting split of growth vs defensive assets by risk appetite. A
// framework to discuss, not personalized advice or a specific-security call.
const ALLOCATION: Record<RiskTolerance, { growth: number; defensive: number }> = {
  conservative: { growth: 30, defensive: 70 },
  moderate: { growth: 60, defensive: 40 },
  aggressive: { growth: 80, defensive: 20 },
};

export type AdvisoryPlan = {
  complete: boolean;
  missing: string[];
  profile: FinancialProfile;
  assumedReturnPct: number | null;
  allocation: { growth: number; defensive: number } | null;
  projection: SavingsProjection | null;
  notes: string[]; // balance-sheet-derived cautions, grounded in stored figures
};

/**
 * Balance-sheet cautions a real planner would raise before recommending a
 * contribution: thin emergency fund, high-interest debt, and a contribution the
 * monthly surplus can't sustain. Each is grounded in a stored figure.
 */
function balanceSheetNotes(profile: FinancialProfile, bs?: BalanceSheet): string[] {
  const notes: string[] = [];
  if (!bs) return notes;

  if (bs.emergencyMonths !== null && bs.emergencyMonths < MIN_EMERGENCY_MONTHS) {
    notes.push(`Your emergency fund covers ~${bs.emergencyMonths.toFixed(1)} months of expenses — build it toward ${MIN_EMERGENCY_MONTHS}–6 months before investing aggressively; it's the buffer that keeps the plan intact in a shock.`);
  }

  const highInterest = bs.liabilities.filter((l) => l.aprPct != null && l.aprPct >= HIGH_INTEREST_APR);
  for (const l of highInterest) {
    notes.push(`**${l.label}** at ${l.aprPct}% is high-interest — clearing it is a guaranteed ${l.aprPct}% return, which beats the ${ASSUMED_RETURN_PCT[profile.riskTolerance!]}% this plan assumes. Prioritize it over extra investing.`);
  }

  if (
    bs.monthlySurplus !== null &&
    profile.monthlyInvestable !== null &&
    profile.monthlyInvestable > bs.monthlySurplus
  ) {
    notes.push(`Your planned ${profile.monthlyCurrency || ""} ${profile.monthlyInvestable.toLocaleString("en-US", { maximumFractionDigits: 0 })}/month is more than your monthly surplus of ${bs.currency || ""} ${bs.monthlySurplus.toLocaleString("en-US", { maximumFractionDigits: 0 })} — the contribution may not be sustainable without trimming expenses.`.trim());
  }

  return notes;
}

export function buildAdvisoryPlan(
  profile: FinancialProfile,
  options: { current?: number; balanceSheet?: BalanceSheet } = {},
): AdvisoryPlan {
  const missing = missingProfileFields(profile);
  if (missing.length || !profile.riskTolerance) {
    return { complete: false, missing, profile, assumedReturnPct: null, allocation: null, projection: null, notes: [] };
  }

  const assumedReturnPct = ASSUMED_RETURN_PCT[profile.riskTolerance];
  const allocation = ALLOCATION[profile.riskTolerance];
  const projection = projectSavings({
    goal: profile.goalAmount!,
    current: Math.max(0, options.current ?? 0),
    monthly: profile.monthlyInvestable!,
    annualRatePct: assumedReturnPct,
    months: profile.horizonYears! * 12,
  });

  return {
    complete: true,
    missing: [],
    profile,
    assumedReturnPct,
    allocation,
    projection,
    notes: balanceSheetNotes(profile, options.balanceSheet),
  };
}

function money(amount: number, currency: string | null): string {
  return `${currency || ""} ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`.trim();
}

const DISCLAIMER =
  "_This is general, educational financial guidance grounded in the figures you set — **not** personalized investment advice, **not** a recommendation of any specific security, and **not** a prediction of returns. The return figure is a labeled planning assumption you can change; real returns vary and capital is at risk. For decisions of this size, confirm with a licensed adviser._";

/** Render the plan. Incomplete profile → a refusal that asks for the missing facts. */
export function formatAdvisoryPlan(plan: AdvisoryPlan): string {
  if (!plan.complete) {
    return [
      "Before I build a plan, I need your profile — I won't advise on numbers you haven't set, and I won't invent them.",
      "",
      `Still to set: **${plan.missing.join(", ")}**.`,
      "",
      ...PROFILE_SET_HINTS,
      "",
      "Set those, then ask me to build a plan again.",
    ].join("\n");
  }

  const p = plan.profile;
  const proj = plan.projection!;
  const alloc = plan.allocation!;
  const cur = p.goalCurrency;

  const feasibility = proj.onTrack
    ? `**On track.** At ${money(p.monthlyInvestable!, p.monthlyCurrency)}/month for ${p.horizonYears} years, you'd reach ~**${money(proj.projected, cur)}** — clearing your **${money(p.goalAmount!, cur)}** goal by ${money(proj.surplus, cur)}.`
    : `**Short as it stands.** At ${money(p.monthlyInvestable!, p.monthlyCurrency)}/month for ${p.horizonYears} years, you'd reach ~**${money(proj.projected, cur)}** — about **${money(proj.shortfall, cur)}** under your **${money(p.goalAmount!, cur)}** goal.` +
      (proj.requiredMonthly !== null
        ? ` Reaching it on time would take about **${money(proj.requiredMonthly, p.monthlyCurrency)}/month**.`
        : "");

  return [
    `**A plan for your ${money(p.goalAmount!, cur)} goal over ${p.horizonYears} years** (${p.riskTolerance} risk)`,
    "",
    "**1. Where the pace lands**",
    feasibility,
    `_Assumption: ${plan.assumedReturnPct}% / yr nominal return for a ${p.riskTolerance} mix — a planning assumption, not a forecast._`,
    "",
    "**2. A starting framework for that risk & horizon**",
    `- Roughly **${alloc.growth}% growth assets / ${alloc.defensive}% defensive** as a starting split to discuss and tailor.`,
    "- Keep an emergency buffer separate from this goal, and revisit the mix as the horizon shortens.",
    "",
    "**3. Sequence that usually pays first**",
    "- Clear any high-interest debt before investing — a guaranteed saved interest rate beats an assumed market return.",
    "- Automate the monthly contribution so the plan runs without willpower.",
    ...(plan.notes.length
      ? ["", "**4. From your balance sheet, I'd flag first**", ...plan.notes.map((n) => `- ${n}`)]
      : []),
    "",
    DISCLAIMER,
  ].join("\n");
}
