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
};

export function buildAdvisoryPlan(
  profile: FinancialProfile,
  options: { current?: number } = {},
): AdvisoryPlan {
  const missing = missingProfileFields(profile);
  if (missing.length || !profile.riskTolerance) {
    return { complete: false, missing, profile, assumedReturnPct: null, allocation: null, projection: null };
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

  return { complete: true, missing: [], profile, assumedReturnPct, allocation, projection };
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
    "",
    DISCLAIMER,
  ].join("\n");
}
