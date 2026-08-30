import assert from "node:assert/strict";
import test from "node:test";

import { comparePayoff, type Debt } from "./debt-payoff.js";
import { buildDebtProgram, formatDebtProgram } from "./debt-program.js";

/** A fixed "now" so every date assertion is exact rather than seasonal. */
const NOW = new Date(Date.UTC(2026, 7, 30)); // 30 August 2026

const THREE: Debt[] = [
  { name: "Barclaycard", balance: 3200, apr: 22.9, minPayment: 80 },
  { name: "Car loan", balance: 8400, apr: 7.4, minPayment: 210 },
  { name: "Store card", balance: 900, apr: 29.9, minPayment: 25 },
];

function program(debts: Debt[], extra: number, income: number | null = null, now = NOW) {
  return buildDebtProgram(comparePayoff(debts, extra, income), debts, now);
}

test("commits to a freedom date matching the simulated months", () => {
  const cmp = comparePayoff(THREE, 400, null);
  const p = buildDebtProgram(cmp, THREE, NOW);
  assert.ok(p);
  const best = p.strategy === "avalanche" ? cmp.avalanche : cmp.snowball;
  assert.equal(p.freedomMonths, best.months);
  // 30 Aug 2026 + 19 months = March 2028.
  assert.equal(p.freedomMonths, 19);
  assert.equal(p.freedomDate, "March 2028");
});

/*
 * The whole point. The simulation always knew which month each debt went; it
 * used to discard it, leaving the desk able to say the ORDER but never the
 * WHEN.
 */
test("dates every debt that disappears on the way", () => {
  const p = program(THREE, 400);
  assert.ok(p);
  assert.deepEqual(p.landmarks.map((l) => l.name), ["Store card", "Barclaycard"]);
  for (const l of p.landmarks) {
    assert.match(l.date, /^[A-Z][a-z]+ \d{4}$/, `${l.name} must carry a real month`);
    assert.ok(l.month > 0 && l.month < p.freedomMonths, `${l.name} at ${l.month} of ${p.freedomMonths}`);
  }
});

/*
 * The final clearance IS the finish line, named at the top of the card.
 * Listing it again is how a deterministic desk starts padding.
 */
test("the last debt cleared is the finish line, not a landmark", () => {
  const cmp = comparePayoff(THREE, 400, null);
  const p = buildDebtProgram(cmp, THREE, NOW);
  assert.ok(p);
  const best = p.strategy === "avalanche" ? cmp.avalanche : cmp.snowball;
  const last = best.order[best.order.length - 1];
  assert.equal(p.landmarks.length, best.order.length - 1);
  assert.ok(!p.landmarks.some((l) => l.name === last), `${last} must not be listed as a landmark`);
  assert.doesNotMatch(formatDebtProgram(p), new RegExp(`${last} gone`));
});

test("a single debt yields a date and no landmarks", () => {
  const p = program([{ name: "Credit card", balance: 4000, apr: 19.9, minPayment: 100 }], 200);
  assert.ok(p);
  assert.equal(p.landmarks.length, 0);
  const text = formatDebtProgram(p);
  assert.match(text, /Debt-free: [A-Z][a-z]+ \d{4}\./);
  assert.doesNotMatch(text, /On the way/, "no empty landmark list");
});

/*
 * The person whose minimums already exceed their income is exactly the person
 * who must never be handed a freedom date — a schedule would have to assume
 * money that is not there.
 */
test("no program when the minimums outrun the income", () => {
  const p = program(
    [
      { name: "Card A", balance: 9000, apr: 24, minPayment: 250 },
      { name: "Card B", balance: 7000, apr: 26, minPayment: 200 },
    ],
    0,
    200,
  );
  assert.equal(p, null);
});

test("no program when no strategy is feasible", () => {
  // A minimum that never outpaces the interest never clears.
  const p = program([{ name: "Card", balance: 20000, apr: 30, minPayment: 1 }], 0);
  assert.equal(p, null);
});

test("no program without debts", () => {
  assert.equal(program([], 500), null);
});

test("the card leads with the date and names each debt", () => {
  const p = program(THREE, 400);
  assert.ok(p);
  const text = formatDebtProgram(p);
  assert.match(text, /^\*\*Debt-free: March 2028\.\*\*/);
  assert.match(text, /Store card gone/);
  assert.match(text, /Barclaycard gone/);
  assert.match(text, /recalculation, not a failure/);
});

/*
 * The plan above already states the interest, the totals and the strategy
 * comparison. Repeating any of it is padding.
 */
test("the card does not repeat what the plan already said", () => {
  const p = program(THREE, 400);
  assert.ok(p);
  const text = formatDebtProgram(p);
  assert.doesNotMatch(text, /interest/i, "the interest belongs to the plan");
  assert.doesNotMatch(text, /Avalanche|Snowball/i, "the strategy belongs to the plan");
  assert.doesNotMatch(text, /payments\b/, "the payment count belongs to the plan");
});

/* Under a one-item list, "the first one is the one to hold on for" restates it. */
test("the first-win highlight is withheld when there is only one landmark", () => {
  const two = program(
    [
      { name: "Store card", balance: 600, apr: 29.9, minPayment: 25 },
      { name: "Car loan", balance: 8400, apr: 7.4, minPayment: 210 },
    ],
    300,
  );
  assert.ok(two);
  assert.equal(two.landmarks.length, 1);
  assert.doesNotMatch(formatDebtProgram(two), /hold on for/);

  const three = program(THREE, 400);
  assert.ok(three);
  assert.match(formatDebtProgram(three), /hold on for/, "with two or more it earns its place");
});

/*
 * The parser numbers debts "Debt 1", "Debt 2" — it never reads a name out of
 * the sentence. "Debt 3 gone" is nobody's milestone, so a placeholder name is
 * replaced with the figures the person actually typed.
 */
test("a placeholder name is labelled with the figures the person typed", () => {
  const anonymous: Debt[] = [
    { name: "Debt 1", balance: 3200, apr: 22.9, minPayment: 80 },
    { name: "Debt 2", balance: 8400, apr: 7.4, minPayment: 210 },
    { name: "Debt 3", balance: 900, apr: 29.9, minPayment: 25 },
  ];
  const p = program(anonymous, 400);
  assert.ok(p);
  const text = formatDebtProgram(p);
  assert.doesNotMatch(text, /Debt \d gone/, "a numbered placeholder must never reach the card");
  assert.match(text, /900\.00 at 29\.9% gone/);
  assert.match(text, /3,200\.00 at 22\.9% gone/);
  // The underlying identity is still carried, for anything that needs it.
  assert.deepEqual(p.landmarks.map((l) => l.name), ["Debt 3", "Debt 1"]);
});

test("a real name is always preferred over the figures", () => {
  const p = program(THREE, 400);
  assert.ok(p);
  const text = formatDebtProgram(p);
  assert.match(text, /Store card gone/);
  assert.doesNotMatch(text, /900\.00 at 29\.9%/, "a named debt is not described by its numbers");
});
