/**
 * Consolidation arithmetic (ADR-025, P3) — the math that answers "would this
 * offer actually help?", which is a different question from "which debt do I
 * attack first?" that debt-payoff.ts answers.
 *
 * Payoff ordering assumes the payments are payable and optimizes interest.
 * Consolidation changes the payment itself, which is the only lever available
 * to someone whose obligations already exceed their income. Pure and
 * network-free: every number here is arithmetic on the numbers given.
 *
 * This engine models and compares. It never asserts that a lender will offer a
 * rate, approve an application, or accept a restructure — those are outcomes no
 * calculator can know, and claiming them would be the kind of promise the
 * platform refuses to make anywhere else.
 */

import type { Debt } from "./debt-payoff.js";

export type ConsolidationOffer = {
  apr: number;
  months: number;
};

export type ConsolidationResult = {
  principal: number;
  /** Balance-weighted average of the current APRs — what the offer must beat. */
  blendedApr: number;
  currentMinimums: number;
  offer: ConsolidationOffer;
  newPayment: number;
  newTotalInterest: number;
  /** Positive means the monthly payment falls by this much. */
  monthlyRelief: number;
  /** True when the offer's rate beats the blended rate being paid now. */
  ratesImprove: boolean;
  /** Against a stated affordable monthly: does the new payment fit? null when unknown. */
  fitsBudget: boolean | null;
  /** What is still short after consolidating, when a budget is known. 0 when it fits. */
  remainingShortfall: number | null;
};

/** Standard amortising payment. Zero-rate loans divide evenly. */
export function paymentForTerm(principal: number, apr: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0;
  const r = apr / 100 / 12;
  if (r <= 0) return Number((principal / months).toFixed(2));
  const payment = (principal * r) / (1 - Math.pow(1 + r, -months));
  return Number(payment.toFixed(2));
}

/** Balance-weighted APR across the debts — the rate consolidation has to beat. */
export function blendedApr(debts: Debt[]): number {
  const principal = debts.reduce((sum, d) => sum + Math.max(0, d.balance), 0);
  if (principal <= 0) return 0;
  const weighted = debts.reduce((sum, d) => sum + Math.max(0, d.balance) * d.apr, 0);
  return Number((weighted / principal).toFixed(4));
}

export function evaluateConsolidation(
  debts: Debt[],
  offer: ConsolidationOffer,
  affordableMonthly?: number | null,
): ConsolidationResult | null {
  const principal = debts.reduce((sum, d) => sum + Math.max(0, d.balance), 0);
  if (!(principal > 0) || !(offer.months > 0) || !Number.isFinite(offer.apr) || offer.apr < 0) return null;

  const currentMinimums = Number(debts.reduce((sum, d) => sum + Math.max(0, d.minPayment), 0).toFixed(2));
  const newPayment = paymentForTerm(principal, offer.apr, offer.months);
  const newTotalInterest = Number((newPayment * offer.months - principal).toFixed(2));
  const blended = blendedApr(debts);

  const budgetKnown = typeof affordableMonthly === "number" && Number.isFinite(affordableMonthly);
  /*
   * A longer term at a lower rate can cut the monthly payment while raising the
   * total interest paid. Both are reported, because someone bridging a shortfall
   * is buying survival with interest and deserves to be told the price.
   */
  return {
    principal: Number(principal.toFixed(2)),
    blendedApr: blended,
    currentMinimums,
    offer,
    newPayment,
    newTotalInterest,
    monthlyRelief: Number((currentMinimums - newPayment).toFixed(2)),
    ratesImprove: offer.apr < blended,
    fitsBudget: budgetKnown ? newPayment <= (affordableMonthly as number) : null,
    remainingShortfall: budgetKnown
      ? Number(Math.max(0, newPayment - (affordableMonthly as number)).toFixed(2))
      : null,
  };
}

/**
 * Months needed to clear `principal` at `apr` while paying exactly `payment`.
 * Null when the payment never amortises — it does not even cover the interest,
 * which is the distinction between "this takes a long time" and "this never
 * ends", and the two must never be printed as the same thing.
 */
export function termToFitPayment(principal: number, apr: number, payment: number): number | null {
  if (!(principal > 0) || !(payment > 0)) return null;
  const r = apr / 100 / 12;
  if (r <= 0) return Math.ceil(principal / payment);
  const interestOnly = principal * r;
  if (payment <= interestOnly) return null;
  const months = -Math.log(1 - (principal * r) / payment) / Math.log(1 + r);
  return Math.ceil(months);
}

/**
 * The rate at which `principal` over `months` costs exactly `payment` — what a
 * lender would have to offer to bring the monthly down to what someone can pay.
 * Bisection, because the payment formula does not invert in closed form. Null
 * when no non-negative rate is low enough, i.e. the term is the binding
 * constraint rather than the rate.
 */
export function aprToFitPayment(principal: number, months: number, payment: number): number | null {
  if (!(principal > 0) || !(months > 0) || !(payment > 0)) return null;
  if (payment < principal / months) return null; // even a 0% loan costs more than this
  let lo = 0;
  /*
   * The cap is the answer, not a failure.
   *
   * This used to return null when even a loan at the cap fit inside the
   * payment — the same value it returns when the payment is too small to
   * amortise at ANY rate. Two opposite situations answering identically, and a
   * caller reading "null" as "nothing fits" would tell somebody with plenty of
   * headroom that their consolidation is infeasible. It is a bound either way:
   * "no higher than 100%" is true, and no real consolidation offer is above it.
   */
  const hiCap = 100;
  let hi = hiCap;
  if (paymentForTerm(principal, hiCap, months) <= payment) return hiCap;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (paymentForTerm(principal, mid, months) > payment) hi = mid;
    else lo = mid;
  }
  return Number(((lo + hi) / 2).toFixed(2));
}
