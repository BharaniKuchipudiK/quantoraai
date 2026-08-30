/**
 * A payoff plan, expressed as a PROGRAM rather than a schedule.
 *
 * The debt engine already computes the honest, defensible answer: debt-free in
 * 38 payments, this much interest, cleared in this order. What it does not do
 * is commit. "38 months" is a number a person converts to a feeling of "a long
 * time" and then forgets; **October 2029** is a date they can put in a calendar.
 *
 * Debt is where this matters most. Nobody celebrates a payoff schedule — they
 * celebrate the month a specific card finally went to zero, and then the next
 * one. Those moments are already in the simulation: it clears debts one at a
 * time and knows the month each one goes. Naming them turns a table into a
 * route with landmarks on it.
 *
 * Two things are added and nothing else:
 *
 *   - a FREEDOM DATE, from the months the simulation already computed
 *   - the MONTH EACH DEBT DISAPPEARS, in the order the strategy clears them
 *
 * The final clearance is deliberately not listed as a landmark: it IS the
 * finish line, already named at the top, and printing it twice makes the desk
 * look like it is padding. Pure and network-free.
 */

import { monthLabel } from "./program-dates.js";
import type { Debt, PayoffComparison, PayoffResult, PayoffStrategy } from "./debt-payoff.js";

export type DebtLandmark = {
  name: string;
  /** What to call this debt in front of the person it belongs to. */
  label: string;
  month: number;
  date: string;
};

/*
 * The message parser never reads a debt's name out of the sentence — it numbers
 * them "Debt 1", "Debt 2" in the order they appear. That is serviceable in a
 * payoff-order list, but a landmark has to be a moment someone recognises, and
 * "Debt 3 gone" is nobody's milestone. Where the name is one of these
 * placeholders, the landmark is labelled with the figures the person actually
 * typed instead. A real name, when a caller supplies one, always wins.
 */
const PLACEHOLDER_NAME = /^Debt \d+$/;

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function labelFor(name: string, debts: Debt[]): string {
  if (!PLACEHOLDER_NAME.test(name)) return name;
  const debt = debts.find((d) => d.name === name);
  return debt ? `${money(debt.balance)} at ${debt.apr}%` : name;
}

export type DebtProgram = {
  strategy: PayoffStrategy;
  freedomMonths: number;
  freedomDate: string;
  /** Every clearance except the last, which is the finish line itself. */
  landmarks: DebtLandmark[];
  /** The first debt to go. The moment a payoff plan stops feeling theoretical. */
  firstWin: DebtLandmark | null;
};

/**
 * Turns a recommended, feasible payoff into a dated program.
 *
 * Returns null when there is no date to commit to — the comparison found no
 * workable strategy, or the simulation produced no clearances. The caller keeps
 * its existing honest refusal in that case; a person whose minimums already
 * exceed their income must never be handed a freedom date.
 */
export function buildDebtProgram(
  comparison: PayoffComparison,
  debts: Debt[],
  now: Date = new Date(),
): DebtProgram | null {
  const { recommended } = comparison;
  if (!recommended) return null;

  const best: PayoffResult = recommended === "avalanche" ? comparison.avalanche : comparison.snowball;
  if (!best.feasible || !(best.months > 0) || !best.cleared.length) return null;

  const dated = best.cleared.map((c) => ({
    name: c.name,
    label: labelFor(c.name, debts),
    month: c.month,
    date: monthLabel(now, c.month),
  }));
  const landmarks = dated.slice(0, -1);

  return {
    strategy: recommended,
    freedomMonths: best.months,
    freedomDate: monthLabel(now, best.months),
    landmarks,
    firstWin: dated[0] ?? null,
  };
}

/**
 * The program card, written to sit UNDER the payoff plan. It states a date, the
 * months the individual debts disappear, and one honest line about what the
 * date depends on. It repeats none of the plan's figures — the interest, the
 * totals and the strategy comparison are all stated above it.
 */
export function formatDebtProgram(program: DebtProgram): string {
  const lines: string[] = [`**Debt-free: ${program.freedomDate}.**`];

  if (program.landmarks.length) {
    // "On the way:" matches the savings program — one platform, one voice.
    lines.push("", "On the way:");
    for (const l of program.landmarks) {
      lines.push(`- **${l.date}** — ${l.label} gone`);
    }
    /*
     * The first clearance is the one that changes behaviour: it is the month
     * the plan stops being arithmetic and starts being evidence. Only said out
     * loud when there is more than one landmark — under a single-item list it
     * restates the line directly above it.
     */
    if (program.firstWin && program.landmarks.length >= 2) {
      lines.push(
        "",
        `_${program.firstWin.date} is the one to hold on for — the first balance at zero is when this stops feeling theoretical._`,
      );
    }
  }

  lines.push(
    "",
    "That date assumes you keep the payment the same every month. If it slips, tell me and I'll work out the new one — that's a recalculation, not a failure.",
  );
  return lines.join("\n");
}
