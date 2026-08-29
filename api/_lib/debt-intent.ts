/**
 * Parses an explicit debt-payoff / consolidation request in a Finance turn and
 * extracts the debts + monthly budget. Like the affordability intent, it fires
 * only on a clear ask; ordinary finance chat returns matched=false.
 *
 * Accepted phrasing is bounded and predictable, e.g.:
 *   "help me pay off my debts: $5,000 at 19.99% (min $150) and
 *    $3,000 at 24%, I can put $600/month extra"
 * A debt without a stated minimum is given a conservative default (see below),
 * flagged so the gateway can disclose the assumption.
 */

import type { Debt } from "./debt-payoff.js";
import type { ConsolidationOffer } from "./debt-consolidation.js";

export type DebtIntent = {
  matched: boolean;
  debts: Debt[];
  extraMonthly: number | null;
  assumedMinimums: boolean;
  /** A monthly figure the user named as money coming IN, never as payment capacity. */
  statedIncome: number | null;
  /** A consolidation offer on the table: a rate and a term to test, not to assume. */
  offer: ConsolidationOffer | null;
};

const TRIGGER = /\b(debt|debts|pay ?off|payoff|consolidat\w*|snowball|avalanche)\b/i;

// "$5,000 at 19.99% (min $150)" / "5000 @ 24%" — global, one match per debt.
const DEBT_RE = /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:at|@)\s*([0-9]+(?:\.[0-9]+)?)\s*%(?:[^%$.]*?min(?:imum)?(?:\s*payment)?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?))?/gi;

/*
 * Every "N per month" in the message. Which one it IS matters more than the
 * number: "I can put $600/month toward this" is payment capacity; "I only earn
 * $15,000 a month" is income, and the two are opposites. The engine adds
 * extraMonthly ON TOP of every minimum payment, so reading an income as
 * capacity tells the simulator the user can pay their minimums PLUS their whole
 * salary — and it answers, deterministically and wrongly, that someone
 * underwater is debt-free in a year. So each candidate is classified by the
 * words immediately before it, and an unclassifiable one is used for neither.
 */
const MONTHLY_RE = /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/|per\s+|a\s+)?\s*(?:month|mo\b|monthly)/gi;

// Money coming in.
const INCOME_WORD = /\b(?:earns?|earning|salary|salaried|income|take[-\s]?home|makes?|making|paid|wages?|pay ?che(?:ck|que)|bring\s+home|revenue)\b/gi;

// Money the user is offering to put against the debts.
const CAPACITY_WORD = /\b(?:extra|spare|budget(?:ed)?|puts?|putting|pays?|paying|afford|available|allocate|spend|towards?|contribute|free|have)\b/gi;

/** Index of the last match of `re` within `text`, or -1. */
function lastIndexOfWord(re: RegExp, text: string): number {
  re.lastIndex = 0;
  let at = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) at = m.index;
  return at;
}

/*
 * Which kind of figure is this? Whichever marker sits CLOSEST to the number, not
 * whichever kind is checked first: "I earn 8000 per month and can put 600 a
 * month toward it" states both, and each number belongs to the word beside it.
 * A window keeps a marker from reaching across a sentence to claim a number.
 */
const NEAR_WINDOW = 52;

function classifyMonthly(before: string): "income" | "capacity" | null {
  const window = before.slice(-NEAR_WINDOW).replace(/^[^]*[.!?]/, "");
  const income = lastIndexOfWord(INCOME_WORD, window);
  const capacity = lastIndexOfWord(CAPACITY_WORD, window);
  if (income < 0 && capacity < 0) return null;
  return income > capacity ? "income" : "capacity";
}

function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A conservative default minimum when the user didn't state one: the greater of
 *  2% of the balance or 25 (currency-agnostic units) — typical card behavior. */
function defaultMinimum(balance: number): number {
  return Number(Math.max(25, balance * 0.02).toFixed(2));
}

/*
 * "consolidate at 9% over 5 years" / "a 7.5% loan for 60 months". The rate must
 * be attached to a consolidation word, not to any of the debts already parsed —
 * "$5,000 at 19.99%" is a debt, and reading it as an offer would have the desk
 * test the problem against itself.
 */
const OFFER_RE = /\b(?:consolidat\w*|refinanc\w*|one\s+loan|single\s+loan|personal\s+loan|balance\s+transfer)\b[^.!?]{0,80}?([0-9]+(?:\.[0-9]+)?)\s*%[^.!?]{0,60}?\b(?:over|for|across)?\s*([0-9]+(?:\.[0-9]+)?)\s*(years?|yrs?|months?|mos?)\b/i;
const OFFER_RE_REVERSED = /\b(?:consolidat\w*|refinanc\w*|one\s+loan|single\s+loan|personal\s+loan|balance\s+transfer)\b[^.!?]{0,80}?([0-9]+(?:\.[0-9]+)?)\s*(years?|yrs?|months?|mos?)[^.!?]{0,60}?\b(?:at|@)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i;

function toMonths(value: number, unit: string): number {
  return /^y/i.test(unit) ? Math.round(value * 12) : Math.round(value);
}

function parseOffer(message: string, debts: Debt[]): ConsolidationOffer | null {
  let apr: number | null = null;
  let months: number | null = null;

  const forward = message.match(OFFER_RE);
  if (forward) {
    apr = num(forward[1]);
    const term = num(forward[2]);
    if (term !== null) months = toMonths(term, forward[3]);
  } else {
    const reversed = message.match(OFFER_RE_REVERSED);
    if (reversed) {
      const term = num(reversed[1]);
      if (term !== null) months = toMonths(term, reversed[2]);
      apr = num(reversed[3]);
    }
  }

  if (apr === null || months === null || months <= 0) return null;
  // An "offer" identical to a debt already on the table is that debt being
  // restated, not a new loan to test.
  if (debts.some((d) => d.apr === apr)) return null;
  return { apr, months };
}

export function parseDebtIntent(message: unknown): DebtIntent {
  const empty: DebtIntent = { matched: false, debts: [], extraMonthly: null, assumedMinimums: false, statedIncome: null, offer: null };
  if (typeof message !== "string" || !message.trim()) return empty;
  if (!TRIGGER.test(message)) return empty;

  const debts: Debt[] = [];
  let assumedMinimums = false;
  let m: RegExpExecArray | null;
  DEBT_RE.lastIndex = 0;
  while ((m = DEBT_RE.exec(message)) !== null) {
    const balance = num(m[1]);
    const apr = num(m[2]);
    if (balance === null || balance <= 0 || apr === null) continue;
    let minPayment = num(m[3]);
    if (minPayment === null || minPayment <= 0) {
      minPayment = defaultMinimum(balance);
      assumedMinimums = true;
    }
    debts.push({ name: `Debt ${debts.length + 1}`, balance, apr, minPayment });
  }

  let extraMonthly: number | null = null;
  let statedIncome: number | null = null;
  MONTHLY_RE.lastIndex = 0;
  let b: RegExpExecArray | null;
  while ((b = MONTHLY_RE.exec(message)) !== null) {
    const amount = num(b[1]);
    if (amount === null) continue;
    const kind = classifyMonthly(message.slice(0, b.index));
    if (kind === "income") {
      if (statedIncome === null) statedIncome = amount;
    } else if (kind === "capacity") {
      if (extraMonthly === null) extraMonthly = amount;
    }
    // Neither marker: the figure is ambiguous, so it funds nothing. The gateway
    // hands an ambiguous turn to the model rather than guessing which one it was.
  }

  // "matched" means the user clearly asked for a debt plan (trigger fired); the
  // gateway decides whether the extracted numbers are enough to compute one.
  return { matched: true, debts, extraMonthly, assumedMinimums, statedIncome, offer: parseOffer(message, debts) };
}
