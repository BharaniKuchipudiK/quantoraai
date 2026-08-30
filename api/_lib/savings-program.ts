/**
 * A savings goal, expressed as a PROGRAM rather than a calculation.
 *
 * The engine already answers "how long will this take" correctly. What it does
 * not do is commit: "in 14 months" is arithmetic, "October 2027" is a date you
 * can put in a calendar and be held to. Nobody writes a testimonial about a
 * calculation; they write one about a journey that finished, and a journey
 * needs a finish line with a name.
 *
 * Two things are added here and nothing else:
 *
 *   - a FINISH DATE, derived from the same months the projection computed
 *   - MILESTONES at a quarter, half and three quarters of the goal, each with
 *     the month it lands in
 *
 * The milestones matter because the middle of a long saving run is where people
 * quit. A quarter of the way is a real event; "keep going" is not.
 *
 * Every milestone is computed with `monthsToReach` — the same function that
 * produced the finish line — rather than by slicing the total duration into
 * equal parts. With any return assumed, growth is not linear, so a linear split
 * would put the markers in the wrong months and quietly overstate early
 * progress. Pure and network-free.
 *
 * This is an ADDITION to the savings plan, never a replacement for it. The
 * plan states the verdict against the horizon the person named; the program
 * dates it. So the text produced here deliberately omits the monthly amount and
 * the duration — the plan above it has already said both, and repeating them
 * would read as a machine padding its answer.
 */

import { monthsToReach, type SavingsInputs, type SavingsProjection } from "./savings-goal.js";
import { monthLabel } from "./program-dates.js";

export type Milestone = {
  /** "A quarter of the way" — written for a person, not a progress bar. */
  label: string;
  fraction: number;
  amount: number;
  monthsIn: number;
  date: string;
};

export type SavingsProgram = {
  goal: number;
  monthly: number;
  finishMonths: number;
  finishDate: string;
  milestones: Milestone[];
};

const MILESTONES: Array<{ fraction: number; label: string }> = [
  { fraction: 0.25, label: "a quarter of the way" },
  { fraction: 0.5, label: "halfway" },
  { fraction: 0.75, label: "three quarters" },
];

/**
 * Turns a reachable projection into a dated program.
 *
 * Returns null when there is no finish line to commit to: the goal is already
 * met (the plan says so on its own, and a program with nothing left to run is
 * noise), or the pace never reaches it within the engine's horizon. In both
 * cases the caller keeps its existing honest answer rather than inventing a
 * date.
 */
export function buildSavingsProgram(
  inputs: SavingsInputs,
  projection: SavingsProjection,
  now: Date = new Date(),
): SavingsProgram | null {
  const { goal, current, monthly, annualRatePct } = inputs;
  if (!(goal > 0) || current >= goal) return null;

  const finishMonths = projection.monthsToGoal;
  if (finishMonths === null || !Number.isFinite(finishMonths) || finishMonths <= 0) return null;

  const milestones: Milestone[] = [];
  for (const { fraction, label } of MILESTONES) {
    const amount = goal * fraction;
    // A marker already behind you is not a milestone — it is a fact about today.
    if (current >= amount) continue;
    const monthsIn = monthsToReach(amount, current, monthly, annualRatePct);
    if (monthsIn === null || monthsIn <= 0 || monthsIn >= finishMonths) continue;
    milestones.push({
      label,
      fraction,
      amount: Number(amount.toFixed(2)),
      monthsIn,
      date: monthLabel(now, monthsIn),
    });
  }

  return {
    goal,
    monthly,
    finishMonths,
    finishDate: monthLabel(now, finishMonths),
    milestones,
  };
}

/** Matches the savings plan's format exactly — two number styles in one card
 *  reads as two different sources. */
function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The program card, written to sit UNDER the savings plan. Deliberately short:
 * a date, the markers on the way, and one honest line about what the date
 * depends on.
 */
export function formatSavingsProgram(program: SavingsProgram): string {
  const lines: string[] = [`**Your finish line: ${program.finishDate}.**`];

  if (program.milestones.length) {
    lines.push("", "On the way:");
    for (const m of program.milestones) {
      lines.push(`- **${m.date}** — ${m.label}, ${money(m.amount)}`);
    }
    lines.push("", "_The middle is where these get abandoned, so the markers are there to be hit._");
  }

  lines.push(
    "",
    "That date holds while the monthly amount does. Miss a month and it moves — tell me when it happens and I'll work out the new one.",
  );
  return lines.join("\n");
}
