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

export type DebtIntent = {
  matched: boolean;
  debts: Debt[];
  extraMonthly: number | null;
  assumedMinimums: boolean;
};

const TRIGGER = /\b(debt|debts|pay ?off|payoff|consolidat\w*|snowball|avalanche)\b/i;

// "$5,000 at 19.99% (min $150)" / "5000 @ 24%" — global, one match per debt.
const DEBT_RE = /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:at|@)\s*([0-9]+(?:\.[0-9]+)?)\s*%(?:[^%$.]*?min(?:imum)?(?:\s*payment)?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?))?/gi;

// "$600/month extra" / "600 per month" / "budget of 600 monthly"
const BUDGET_RE = /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/|per\s+)?\s*(?:month|mo\b|monthly)/i;

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

export function parseDebtIntent(message: unknown): DebtIntent {
  const empty: DebtIntent = { matched: false, debts: [], extraMonthly: null, assumedMinimums: false };
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

  const budgetMatch = message.match(BUDGET_RE);
  const extraMonthly = budgetMatch ? num(budgetMatch[1]) : null;

  // "matched" means the user clearly asked for a debt plan (trigger fired); the
  // gateway decides whether the extracted numbers are enough to compute one.
  return { matched: true, debts, extraMonthly, assumedMinimums };
}
