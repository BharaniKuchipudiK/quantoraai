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
import type { WhatIf } from "./finance-advisor-intent.js";
import {
  simulateGoalProbability,
  requiredMonthlyForConfidence,
  CONFIDENCE_TARGET_PCT,
  type MonteCarloResult,
} from "./monte-carlo.js";

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

// LABELED annualized volatility per risk mix — the spread the Monte Carlo draws
// from. Planning assumptions, not a claim about any particular future.
const ASSUMED_VOL_PCT: Record<RiskTolerance, number> = {
  conservative: 6,
  moderate: 11,
  aggressive: 16,
};

export type AdvisoryPlan = {
  complete: boolean;
  missing: string[];
  profile: FinancialProfile;
  assumedReturnPct: number | null;
  allocation: { growth: number; defensive: number } | null;
  projection: SavingsProjection | null;
  monteCarlo: MonteCarloResult | null; // goal-probability across many scenarios
  monteCarloTargetMonthly: number | null; // contribution that reaches ~target confidence (when short)
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
    return { complete: false, missing, profile, assumedReturnPct: null, allocation: null, projection: null, monteCarlo: null, monteCarloTargetMonthly: null, notes: [] };
  }

  const assumedReturnPct = ASSUMED_RETURN_PCT[profile.riskTolerance];
  const allocation = ALLOCATION[profile.riskTolerance];
  const current = Math.max(0, options.current ?? 0);
  const months = profile.horizonYears! * 12;
  const projection = projectSavings({
    goal: profile.goalAmount!,
    current,
    monthly: profile.monthlyInvestable!,
    annualRatePct: assumedReturnPct,
    months,
  });

  // Odds of reaching the goal across many return paths — the honest read on a
  // single-point projection. Seeded, so the probability is reproducible.
  const mcInputs = {
    goal: profile.goalAmount!,
    current,
    monthlyContribution: profile.monthlyInvestable!,
    horizonMonths: months,
    annualReturnPct: assumedReturnPct,
    annualVolPct: ASSUMED_VOL_PCT[profile.riskTolerance],
  };
  const monteCarlo = simulateGoalProbability(mcInputs);

  // When the odds are short of a healthy bar, solve for the contribution that
  // would get there — the "you'd need to save $X" a real planner states.
  const monteCarloTargetMonthly =
    monteCarlo.probabilityPct < CONFIDENCE_TARGET_PCT ? requiredMonthlyForConfidence(mcInputs) : null;

  return {
    complete: true,
    missing: [],
    profile,
    assumedReturnPct,
    allocation,
    projection,
    monteCarlo,
    monteCarloTargetMonthly,
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

  const mc = plan.monteCarlo;
  const lift = plan.monteCarloTargetMonthly !== null
    ? `To lift the odds to about ${CONFIDENCE_TARGET_PCT}%, raise your contribution to roughly **${money(plan.monteCarloTargetMonthly, p.monthlyCurrency)}/month**.`
    : null;
  const odds = mc
    ? [
        "",
        "**2. The odds, across 1,000 scenarios**",
        `Reaching your goal in **${mc.probabilityPct}%** of ${mc.paths.toLocaleString("en-US")} simulated return paths. Typical (median) ending balance **${money(mc.p50, cur)}**; a tough decade (bottom 10%) still lands near **${money(mc.p10, cur)}**, a strong one (top 10%) near **${money(mc.p90, cur)}**.`,
        ...(lift ? [lift] : []),
        `_A range beats a single number: it shows the uncertainty, not a promise. Built on the labeled ${plan.assumedReturnPct}% return / ${ASSUMED_VOL_PCT[p.riskTolerance!]}% volatility assumptions — not a prediction._`,
      ]
    : [];

  return [
    `**A plan for your ${money(p.goalAmount!, cur)} goal over ${p.horizonYears} years** (${p.riskTolerance} risk)`,
    "",
    "**1. Where the pace lands**",
    feasibility,
    `_Assumption: ${plan.assumedReturnPct}% / yr nominal return for a ${p.riskTolerance} mix — a planning assumption, not a forecast._`,
    ...odds,
    "",
    "**3. A starting framework for that risk & horizon**",
    `- Roughly **${alloc.growth}% growth assets / ${alloc.defensive}% defensive** as a starting split to discuss and tailor.`,
    "- Keep an emergency buffer separate from this goal, and revisit the mix as the horizon shortens.",
    "",
    "**4. Sequence that usually pays first**",
    "- Clear any high-interest debt before investing — a guaranteed saved interest rate beats an assumed market return.",
    "- Automate the monthly contribution so the plan runs without willpower.",
    ...(plan.notes.length
      ? ["", "**5. From your balance sheet, I'd flag first**", ...plan.notes.map((n) => `- ${n}`)]
      : []),
    "",
    DISCLAIMER,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// What-if scenario modeling — rerun the plan under a hypothetical adjustment
// (more per month, a longer horizon, a different risk mix, a bigger goal) and
// show the delta, the signature move of Boldin/Empower-class planners. It reuses
// the same seeded engine for both sides, so the comparison is like-for-like and
// the change in odds is attributable to the lever, not to simulation noise.

/** Apply a hypothetical adjustment over the saved profile. Only stated levers move. */
export function applyWhatIf(profile: FinancialProfile, adj: WhatIf): FinancialProfile {
  const next: FinancialProfile = { ...profile };
  if (typeof adj.monthlyOverride === "number") next.monthlyInvestable = adj.monthlyOverride;
  if (typeof adj.addMonthly === "number") next.monthlyInvestable = (profile.monthlyInvestable ?? 0) + adj.addMonthly;
  if (typeof adj.horizonYears === "number") next.horizonYears = adj.horizonYears;
  if (adj.risk) next.riskTolerance = adj.risk;
  if (typeof adj.goalOverride === "number") next.goalAmount = adj.goalOverride;
  return next;
}

export type WhatIfComparison = {
  applicable: boolean; // both sides complete and a lever actually moved
  changes: string[]; // human-readable "before → after" per lever
  base: AdvisoryPlan;
  scenario: AdvisoryPlan;
};

/** The levers that actually moved, each as a "before → after" phrase. */
function describeChanges(before: FinancialProfile, after: FinancialProfile): string[] {
  const changes: string[] = [];
  const mcur = after.monthlyCurrency || before.monthlyCurrency;
  const gcur = after.goalCurrency || before.goalCurrency;
  if (after.monthlyInvestable !== null && after.monthlyInvestable !== before.monthlyInvestable) {
    changes.push(`Contribution **${money(before.monthlyInvestable ?? 0, mcur)} → ${money(after.monthlyInvestable, mcur)}/month**`);
  }
  if (after.horizonYears !== null && after.horizonYears !== before.horizonYears) {
    changes.push(`Horizon **${before.horizonYears} → ${after.horizonYears} years**`);
  }
  if (after.riskTolerance && after.riskTolerance !== before.riskTolerance) {
    changes.push(`Risk **${before.riskTolerance} → ${after.riskTolerance}**`);
  }
  if (after.goalAmount !== null && after.goalAmount !== before.goalAmount) {
    changes.push(`Goal **${money(before.goalAmount ?? 0, gcur)} → ${money(after.goalAmount, gcur)}**`);
  }
  return changes;
}

export function buildWhatIfComparison(
  profile: FinancialProfile,
  adj: WhatIf,
  options: { current?: number; balanceSheet?: BalanceSheet } = {},
): WhatIfComparison {
  const base = buildAdvisoryPlan(profile, options);
  const adjusted = applyWhatIf(profile, adj);
  const scenario = buildAdvisoryPlan(adjusted, options);
  const changes = describeChanges(profile, adjusted);
  return { applicable: base.complete && scenario.complete && changes.length > 0, changes, base, scenario };
}

function signedPts(delta: number): string {
  const r = Math.round(delta * 10) / 10;
  return `${r >= 0 ? "+" : "−"}${Math.abs(r)} pts`;
}

function signedMoney(delta: number, currency: string | null): string {
  return `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta), currency)}`;
}

/**
 * Render the comparison. Assumes the plan is applicable (both sides complete);
 * the gateway falls back to the ordinary plan/refusal when it isn't.
 */
export function formatWhatIfComparison(cmp: WhatIfComparison): string {
  const { base, scenario } = cmp;
  const p = scenario.profile;
  const cur = p.goalCurrency;
  const bMc = base.monteCarlo!;
  const sMc = scenario.monteCarlo!;
  const oddsDelta = Number((sMc.probabilityPct - bMc.probabilityPct).toFixed(1));

  const crossesUp = bMc.probabilityPct < CONFIDENCE_TARGET_PCT && sMc.probabilityPct >= CONFIDENCE_TARGET_PCT;
  const stillShort = sMc.probabilityPct < CONFIDENCE_TARGET_PCT && scenario.monteCarloTargetMonthly !== null;
  const verdict = crossesUp
    ? `That clears the ~${CONFIDENCE_TARGET_PCT}% planning bar — the change is enough on its own.`
    : stillShort
      ? `Even with this, the odds stay under ${CONFIDENCE_TARGET_PCT}%. To get there you'd need about **${money(scenario.monteCarloTargetMonthly!, p.monthlyCurrency)}/month**.`
      : null;

  return [
    `**What-if — ${cmp.changes.join("; ")}**`,
    "",
    `**Goal odds:** ${bMc.probabilityPct}% → **${sMc.probabilityPct}%** (${signedPts(oddsDelta)})`,
    `**Median outcome:** ${money(bMc.p50, cur)} → **${money(sMc.p50, cur)}** (${signedMoney(sMc.p50 - bMc.p50, cur)})`,
    `**Tough decade (bottom 10%):** ${money(bMc.p10, cur)} → **${money(sMc.p10, cur)}**`,
    `**Where the pace lands:** ${base.projection!.onTrack ? "on track" : "short"} → **${scenario.projection!.onTrack ? "on track" : "short"}**`,
    ...(verdict ? ["", verdict] : []),
    // Better odds are not free: a higher contribution can outrun the monthly
    // surplus, and going aggressive while carrying high-interest debt or a thin
    // buffer is a real trade-off. Carry the scenario's balance-sheet cautions
    // through so the comparison never sells a lift without the catch.
    ...(scenario.notes.length
      ? ["", "**Worth flagging under this scenario:**", ...scenario.notes.map((n) => `- ${n}`)]
      : []),
    "",
    `_Both sides use the same seeded ${sMc.paths.toLocaleString("en-US")}-path simulation under each mix's labeled return/volatility assumptions — a like-for-like comparison, not a forecast._`,
    "",
    DISCLAIMER,
  ].join("\n");
}
