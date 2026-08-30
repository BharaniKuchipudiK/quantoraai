import assert from "node:assert/strict";
import test from "node:test";

import { projectSavings, type SavingsInputs } from "./savings-goal.js";
import { buildSavingsProgram, formatSavingsProgram } from "./savings-program.js";

/** A fixed "now" so every date assertion below is exact rather than seasonal. */
const NOW = new Date(Date.UTC(2026, 7, 30)); // 30 August 2026

function program(inputs: SavingsInputs, now = NOW) {
  return buildSavingsProgram(inputs, projectSavings(inputs), now);
}

const REACHABLE: SavingsInputs = { goal: 12000, current: 0, monthly: 1000, annualRatePct: 0, months: 12 };

test("names the month the goal is actually reached", () => {
  const p = program(REACHABLE);
  assert.ok(p);
  assert.equal(p.finishMonths, 12);
  assert.equal(p.finishDate, "August 2027");
});

test("the finish month rolls the year over correctly", () => {
  // Five months out from August lands in January of the following year.
  const p = program({ goal: 5000, current: 0, monthly: 1000, annualRatePct: 0, months: 5 });
  assert.ok(p);
  assert.equal(p.finishDate, "January 2027");
});

test("places a quarter, a half and three quarters on the way", () => {
  const p = program(REACHABLE);
  assert.ok(p);
  assert.deepEqual(p.milestones.map((m) => m.monthsIn), [3, 6, 9]);
  assert.deepEqual(p.milestones.map((m) => m.date), ["November 2026", "February 2027", "May 2027"]);
  assert.deepEqual(p.milestones.map((m) => m.amount), [3000, 6000, 9000]);
  assert.match(formatSavingsProgram(p), /3,000\.00/, "markers use the same money format as the plan");
});

/*
 * The reason milestones are computed rather than interpolated. With a return
 * assumed, growth is not linear, so the halfway marker arrives LATER than half
 * the duration — slicing the total into equal parts would claim the saver is
 * ahead of where they are.
 */
test("milestones are computed, not interpolated across the duration", () => {
  const inputs: SavingsInputs = { goal: 50000, current: 0, monthly: 500, annualRatePct: 8, months: 120 };
  const p = program(inputs);
  assert.ok(p);
  const halfway = p.milestones.find((m) => m.fraction === 0.5);
  assert.ok(halfway, "a halfway marker is expected on a run this long");
  assert.ok(
    halfway.monthsIn > p.finishMonths / 2,
    `compounding must push halfway past the midpoint (got ${halfway.monthsIn} of ${p.finishMonths})`,
  );
});

test("no marker lands on or after the finish line", () => {
  for (const rate of [0, 5, 12]) {
    const p = program({ goal: 20000, current: 250, monthly: 300, annualRatePct: rate, months: 60 });
    assert.ok(p, `a program is expected at ${rate}%`);
    for (const m of p.milestones) {
      assert.ok(m.monthsIn > 0 && m.monthsIn < p.finishMonths, `marker at ${m.monthsIn} of ${p.finishMonths}`);
    }
  }
});

test("markers already behind you are dropped, not dated in the past", () => {
  // 7,000 of a 10,000 goal is past both the quarter and the halfway marks.
  const p = program({ goal: 10000, current: 7000, monthly: 500, annualRatePct: 0, months: 12 });
  assert.ok(p);
  assert.deepEqual(p.milestones.map((m) => m.fraction), [0.75]);
});

test("no program when the pace never reaches the goal", () => {
  assert.equal(program({ goal: 100000, current: 0, monthly: 0, annualRatePct: 0, months: 12 }), null);
});

test("no program when the goal is already met", () => {
  assert.equal(program({ goal: 5000, current: 6000, monthly: 200, annualRatePct: 0, months: 12 }), null);
});

test("no program without a real goal", () => {
  assert.equal(program({ goal: 0, current: 0, monthly: 200, annualRatePct: 0, months: 12 }), null);
});

test("the card leads with the date and lists the markers", () => {
  const p = program(REACHABLE);
  assert.ok(p);
  const text = formatSavingsProgram(p);
  assert.match(text, /^\*\*Your finish line: August 2027\.\*\*/);
  assert.match(text, /November 2026/);
  assert.match(text, /Miss a month and it moves/);
});

/*
 * The plan above this card already states the monthly amount and the duration.
 * Repeating them here is how a deterministic desk starts sounding like padding.
 */
test("the card does not repeat what the plan already said", () => {
  const p = program(REACHABLE);
  assert.ok(p);
  const text = formatSavingsProgram(p);
  assert.doesNotMatch(text, /\/month/, "the monthly amount belongs to the plan");
  assert.doesNotMatch(text, /\b12 months\b/, "the duration belongs to the plan");
});

test("a program with no markers still commits to a date", () => {
  // One month out: every marker is either behind you or lands on the finish.
  const p = program({ goal: 1000, current: 900, monthly: 500, annualRatePct: 0, months: 6 });
  assert.ok(p);
  assert.equal(p.milestones.length, 0);
  const text = formatSavingsProgram(p);
  assert.match(text, /Your finish line/);
  assert.doesNotMatch(text, /On the way/, "no empty milestone list");
});
