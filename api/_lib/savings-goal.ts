/**
 * Deterministic savings-goal engine (ADR-025, P3).
 *
 * Given a goal, a horizon, a current balance and a monthly contribution (plus an
 * optional return rate), it projects the future value with monthly compounding
 * and answers three things: are you on track, what monthly amount hits the goal
 * on time, and how long the goal takes at the current pace. Pure arithmetic — a
 * savings answer is reproducible, never a model guess.
 */

export type SavingsInputs = {
  goal: number;
  current: number;
  monthly: number;
  annualRatePct: number; // 0 when no return assumed
  months: number;
};

export type SavingsProjection = {
  projected: number; // balance at the horizon
  onTrack: boolean;
  shortfall: number; // max(0, goal - projected)
  surplus: number; // max(0, projected - goal)
  requiredMonthly: number | null; // monthly needed to hit the goal in `months` (null if goal already met by `current`)
  monthsToGoal: number | null; // months to reach the goal at the given monthly (null if never within the cap)
};

const HORIZON_CAP = 1200;

function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12;
}

/** Future value of a starting balance plus a monthly contribution. */
export function futureValue(current: number, monthly: number, annualRatePct: number, months: number): number {
  const r = monthlyRate(annualRatePct);
  if (months <= 0) return Number(current.toFixed(2));
  const growth = r === 0 ? current + monthly * months : current * (1 + r) ** months + monthly * (((1 + r) ** months - 1) / r);
  return Number(growth.toFixed(2));
}

/** Monthly contribution required to reach `goal` in `months` (floored at 0). */
export function requiredMonthly(goal: number, current: number, annualRatePct: number, months: number): number {
  if (months <= 0) return goal > current ? Infinity : 0;
  const r = monthlyRate(annualRatePct);
  const needed = r === 0
    ? (goal - current) / months
    : (goal - current * (1 + r) ** months) / (((1 + r) ** months - 1) / r);
  return Number(Math.max(0, needed).toFixed(2));
}

/** Months to reach `goal` at the given monthly contribution, or null if it never does within the cap. */
export function monthsToReach(goal: number, current: number, monthly: number, annualRatePct: number): number | null {
  if (current >= goal) return 0;
  const r = monthlyRate(annualRatePct);
  let balance = current;
  for (let m = 1; m <= HORIZON_CAP; m += 1) {
    balance = balance * (1 + r) + monthly;
    if (balance >= goal) return m;
  }
  return null;
}

export function projectSavings(inputs: SavingsInputs): SavingsProjection {
  const { goal, current, monthly, annualRatePct, months } = inputs;
  const projected = futureValue(current, monthly, annualRatePct, months);
  const onTrack = projected >= goal;
  return {
    projected,
    onTrack,
    shortfall: Number(Math.max(0, goal - projected).toFixed(2)),
    surplus: Number(Math.max(0, projected - goal).toFixed(2)),
    requiredMonthly: current >= goal ? null : requiredMonthly(goal, current, annualRatePct, months),
    monthsToGoal: monthsToReach(goal, current, monthly, annualRatePct),
  };
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function humanMonths(n: number): string {
  const years = Math.floor(n / 12);
  const rem = n % 12;
  const parts = [];
  if (years) parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  if (rem) parts.push(`${rem} mo`);
  return parts.join(" ") || "0 mo";
}

export function formatSavingsPlan(inputs: SavingsInputs, projection: SavingsProjection): string {
  const { goal, monthly, annualRatePct, months } = inputs;
  const rateNote = annualRatePct > 0 ? ` at ${annualRatePct}% / yr` : " with no return assumed";
  const lines: string[] = [];

  if (projection.onTrack) {
    lines.push(
      `**On track.** Saving **${money(monthly)}/month**${rateNote}, you'd reach **${money(projection.projected)}** in **${humanMonths(months)}** — that's **${money(projection.surplus)}** above your **${money(goal)}** goal.`,
    );
    if (projection.monthsToGoal !== null && projection.monthsToGoal < months) {
      lines.push("", `You'd actually hit **${money(goal)}** in **${humanMonths(projection.monthsToGoal)}** at this pace.`);
    }
  } else {
    lines.push(
      `**Short of the goal.** At **${money(monthly)}/month**${rateNote}, you'd have **${money(projection.projected)}** in **${humanMonths(months)}** — **${money(projection.shortfall)}** short of **${money(goal)}**.`,
    );
    if (projection.requiredMonthly !== null && Number.isFinite(projection.requiredMonthly)) {
      lines.push("", `To hit it on time, save **${money(projection.requiredMonthly)}/month**.`);
    }
    if (projection.monthsToGoal !== null) {
      lines.push(`At your current **${money(monthly)}/month**, you'd get there in **${humanMonths(projection.monthsToGoal)}**.`);
    } else {
      lines.push(`At your current pace it doesn't reach the goal within a reasonable horizon — raise the monthly amount.`);
    }
  }

  lines.push("", "These figures are a deterministic projection of your inputs — not a model estimate.");
  return lines.join("\n");
}
