/**
 * Debt-crisis + consolidation engine (ADR-025, Phase B) — the deterministic core
 * behind "bridge the gap between my salary and my debt".
 *
 * It synthesizes the whole picture (income, essential expenses, every liability)
 * and answers the real question a person in a cash-flow squeeze has: can I even
 * cover my minimums, would consolidation help, and exactly how much do I have to
 * free up. Decisive by design — it leads with the verdict and the one number
 * that matters (the monthly gap), lays out every option with real figures, and
 * then hands the decision back to the human. It never picks the path for you.
 *
 * Pure arithmetic, reusing the payoff simulator. No forecast, no market call —
 * a consolidation answer must be reproducible and defensible.
 */

import { type Debt, comparePayoff, type PayoffComparison } from "./debt-payoff.js";
/*
 * The arithmetic lives in ONE place. This file shipped its own amortizedPayment
 * and maxRateForPayment, line-for-line equivalent to paymentForTerm and
 * aprToFitPayment — two consolidation engines that could disagree with each
 * other about the same person's money, in the same workspace. Whichever
 * answered first would have been the truth of that turn.
 */
import { aprToFitPayment, paymentForTerm, type ConsolidationOffer } from "./debt-consolidation.js";
import { finiteNonNeg, safeMoney } from "./finance-safe.js";

// Hard ceiling on how many liabilities the simulator will chew through, so an
// absurdly large upload can never turn into an unbounded computation.
const MAX_DEBTS = 200;

export type CrisisInputs = {
  incomeMonthly: number;
  essentialExpenses: number; // non-debt essentials
  debts: Debt[];
  currency: string;
};

/*
 * One name, one shape. This file exported its own ConsolidationOffer
 * ({ratePct, termMonths}) while debt-consolidation.ts exported another
 * ({apr, months}) — the same concept, the same workspace, two types a reader
 * would reasonably assume were one. Re-exported here so the existing importers
 * keep working without a second definition existing anywhere.
 */
export type { ConsolidationOffer } from "./debt-consolidation.js";

export type CrisisSeverity = "manageable" | "tight" | "shortfall" | "critical";

export type CrisisAssessment = {
  incomeMonthly: number;
  essentialExpenses: number;
  availableForDebt: number; // income - essentials
  totalBalance: number;
  totalMinPayments: number;
  blendedAprPct: number;
  gap: number; // totalMinPayments - availableForDebt (positive = short of even minimums)
  severity: CrisisSeverity;
  highestApr: Debt | null;
};

/** Standard amortized monthly payment for a loan. */
/** Coerce arbitrary inputs to sane, bounded, finite debts — defense in depth. */
export function sanitizeDebts(debts: Debt[]): Debt[] {
  return (Array.isArray(debts) ? debts : [])
    .slice(0, MAX_DEBTS)
    .map((d) => ({
      name: typeof d?.name === "string" && d.name.trim() ? d.name.slice(0, 80) : "debt",
      balance: finiteNonNeg(d?.balance),
      apr: Math.min(finiteNonNeg(d?.apr), 200),
      minPayment: finiteNonNeg(d?.minPayment),
    }))
    .filter((d) => d.balance > 0);
}

export function assessCrisis(inputs: CrisisInputs): CrisisAssessment {
  const debts = sanitizeDebts(inputs.debts);
  const income = finiteNonNeg(inputs.incomeMonthly);
  const essentials = finiteNonNeg(inputs.essentialExpenses);
  const totalBalance = Number(debts.reduce((s, d) => s + d.balance, 0).toFixed(2));
  const totalMinPayments = Number(debts.reduce((s, d) => s + Math.max(0, d.minPayment), 0).toFixed(2));
  const blendedAprPct = totalBalance > 0
    ? Number((debts.reduce((s, d) => s + d.balance * d.apr, 0) / totalBalance).toFixed(2))
    : 0;
  const availableForDebt = Number((income - essentials).toFixed(2));
  const gap = Number((totalMinPayments - availableForDebt).toFixed(2));

  let severity: CrisisSeverity;
  if (availableForDebt <= 0) severity = "critical";
  else if (gap > 0) severity = "shortfall";
  else if (gap > -0.1 * Math.max(1, totalMinPayments)) severity = "tight";
  else severity = "manageable";

  const highestApr = debts.length ? debts.reduce((a, b) => (b.apr > a.apr ? b : a)) : null;
  return { incomeMonthly: income, essentialExpenses: essentials, availableForDebt, totalBalance, totalMinPayments, blendedAprPct, gap, severity, highestApr };
}

export type ConsolidationScenario = {
  kind: "offer" | "fit-to-budget" | "infeasible";
  termMonths: number;
  ratePct: number | null; // the offer's rate, or the max rate that fits, or null when nothing fits
  payment: number | null;
  fitsBudget: boolean;
  note: string;
};

/** Model consolidation: either a concrete offer, or solve for what would fit the budget. */
export function analyzeConsolidation(assessment: CrisisAssessment, offer?: ConsolidationOffer): ConsolidationScenario {
  const { totalBalance, availableForDebt } = assessment;
  if (totalBalance <= 0) return { kind: "infeasible", termMonths: 0, ratePct: null, payment: null, fitsBudget: false, note: "No balances to consolidate." };

  const ratePct = Math.min(finiteNonNeg(offer?.apr), 200);
  const termMonths = Math.min(Math.max(Math.round(finiteNonNeg(offer?.months)), 0), 600);
  if (offer && termMonths > 0) {
    const payment = paymentForTerm(totalBalance, ratePct, termMonths);
    return {
      kind: "offer",
      termMonths,
      ratePct,
      payment,
      fitsBudget: availableForDebt > 0 && payment <= availableForDebt,
      note: `A single loan of the full balance at ${ratePct}% over ${termMonths} months is one payment of about {payment}.`,
    };
  }

  // No offer: solve for what fits. Prefer the shortest term that fits the budget.
  for (const termMonths of [36, 48, 60, 84]) {
    const maxRate = availableForDebt > 0 ? aprToFitPayment(totalBalance, termMonths, availableForDebt) : null;
    if (maxRate !== null) {
      return {
        kind: "fit-to-budget",
        termMonths,
        ratePct: maxRate,
        payment: availableForDebt,
        fitsBudget: true,
        note: `To fit your budget, a consolidation loan of the full balance needs a rate no higher than ${maxRate}% over ${termMonths} months.`,
      };
    }
  }
  // Even a 0% loan over 7 years exceeds the budget → structural, not a rate problem.
  const floorPayment = paymentForTerm(totalBalance, 0, 84);
  return {
    kind: "infeasible",
    termMonths: 84,
    ratePct: null,
    payment: floorPayment,
    fitsBudget: false,
    note: `Even an interest-free loan over 7 years would need about {floor}/month — more than the {avail} you have for debt. Consolidation alone can't bridge this; the gap has to close through income or essentials.`,
  };
}

export type CrisisPlan = {
  assessment: CrisisAssessment;
  payoff: PayoffComparison | null; // status-quo aggressive payoff, when there's room
  consolidation: ConsolidationScenario;
  currency: string;
};

export function buildCrisisPlan(inputs: CrisisInputs, options: { offer?: ConsolidationOffer } = {}): CrisisPlan {
  const assessment = assessCrisis(inputs);
  const debts = sanitizeDebts(inputs.debts);
  const extra = Math.max(0, assessment.availableForDebt - assessment.totalMinPayments);
  const payoff = debts.length ? comparePayoff(debts, extra) : null;
  const consolidation = analyzeConsolidation(assessment, options.offer);
  return { assessment, payoff, consolidation, currency: inputs.currency };
}

function m(amount: number, currency: string): string {
  return safeMoney(amount, currency);
}

/** Decisive, human-in-the-loop write-up: verdict, picture, options with numbers, your move. */
export function formatCrisisPlan(plan: CrisisPlan, opts: { assumedMinimums?: boolean } = {}): string {
  const a = plan.assessment;
  const c = plan.currency;
  const cons = plan.consolidation;

  // 1) Verdict first — the one number that matters, no preamble.
  let verdict: string;
  if (a.severity === "critical") {
    verdict = `**Straight answer: your essentials (${m(a.essentialExpenses, c)}) already consume your income (${m(a.incomeMonthly, c)}), so there's nothing left for debt.** This is a restructuring / credit-counseling situation, not a budgeting one — no payoff schedule fixes a negative starting point.`;
  } else if (a.severity === "shortfall") {
    verdict = `**Straight answer: you're ${m(a.gap, c)}/month short of even the minimum payments.** A structural gap like this won't close by budgeting harder — you either lower the monthly payment (consolidate / extend the term) or free up ${m(a.gap, c)} from income or essentials. Both levers are below.`;
  } else if (a.severity === "tight") {
    verdict = `**Straight answer: you can just cover the minimums, with little room to spare.** You're not in crisis, but you're one shock from it — the priority is speed and a buffer.`;
  } else {
    verdict = `**Straight answer: you can cover the minimums with ${m(a.availableForDebt - a.totalMinPayments, c)}/month to spare.** Put that spare toward the highest-rate debt and you'll clear this faster than the minimums alone.`;
  }

  // 2) The picture — synthesized from everything you've given.
  const picture = [
    "**The picture**",
    `- Income: ${m(a.incomeMonthly, c)}/mo · Essentials: ${m(a.essentialExpenses, c)}/mo → **${m(a.availableForDebt, c)}/mo for debt**`,
    `- Debt: **${m(a.totalBalance, c)}** across ${plan.payoff ? plan.payoff.avalanche.order.length || "several" : "your"} balances · blended rate **${a.blendedAprPct}%**`,
    `- Minimum payments total **${m(a.totalMinPayments, c)}/mo**${a.highestApr ? ` · highest-rate debt: **${a.highestApr.name}** at ${a.highestApr.apr}%` : ""}`,
  ];

  // 3) Options — every lever, with real figures.
  const options: string[] = ["**Your options**"];

  // A) Consolidate
  if (cons.kind === "offer" && cons.payment !== null) {
    options.push(`- **A — Consolidate (your offer):** one loan of ${m(a.totalBalance, c)} at ${cons.ratePct}% over ${cons.termMonths} mo = **${m(cons.payment, c)}/mo**${cons.fitsBudget ? " — fits your budget." : ` — still above the ${m(a.availableForDebt, c)} you have; you'd need a longer term or lower rate.`}`);
  } else if (cons.kind === "fit-to-budget" && cons.ratePct !== null) {
    options.push(`- **A — Consolidate (to fit your budget):** a single ${m(a.totalBalance, c)} loan at **≤ ${cons.ratePct}% over ${cons.termMonths} mo** lands at ${m(cons.payment ?? a.availableForDebt, c)}/mo — within reach. Bring me a real offer's rate + term and I'll check it exactly.`);
  } else {
    options.push(`- **A — Consolidate:** won't bridge this alone — ${cons.payment !== null ? `even a 0% loan over 7 years is ~${m(cons.payment, c)}/mo, above your ${m(a.availableForDebt, c)}.` : "there's no budget available for debt."} Consolidation only helps once the gap below is closed.`);
  }

  // B) Aggressive payoff — only honest when the budget actually covers the minimums.
  const canCoverMinimums = a.availableForDebt >= a.totalMinPayments;
  if (canCoverMinimums && plan.payoff?.recommended) {
    const best = plan.payoff.recommended === "avalanche" ? plan.payoff.avalanche : plan.payoff.snowball;
    options.push(`- **B — Attack it as-is (${plan.payoff.recommended}):** debt-free in **${Math.round(best.months / 12 * 10) / 10} yrs** (${best.months} mo), ${m(best.totalInterest, c)} total interest, order ${best.order.join(" → ")}.`);
  } else {
    options.push(`- **B — Attack it as-is:** not possible at today's budget — you can't fully cover the ${m(a.totalMinPayments, c)} in minimums with ${m(a.availableForDebt, c)}, so the balances don't clear. Close the gap first (A / C).`);
  }

  // C) Close the gap
  if (a.gap > 0) {
    options.push(`- **C — Close the gap:** free up **${m(a.gap, c)}/mo** — cut essentials, raise income, or both — to at least cover minimums. This is the floor; anything above it starts reducing the debt.`);
  } else {
    options.push(`- **C — Redirect the surplus:** you already clear minimums; steer the spare ${m(Math.max(0, a.availableForDebt - a.totalMinPayments), c)}/mo to the ${a.highestApr ? `${a.highestApr.apr}% ${a.highestApr.name}` : "highest-rate debt"} first.`);
  }

  // D) Negotiate / restructure
  options.push(`- **D — Negotiate / restructure:** call the ${a.highestApr ? `${a.highestApr.name} (${a.highestApr.apr}%)` : "highest-rate"} lender for a hardship rate or a fixed repayment plan${a.severity === "critical" || a.severity === "shortfall" ? " — and speak to a non-profit credit counsellor; a structural shortfall is exactly what they exist for." : "."}`);

  // 4) Human-in-the-loop — the plan ends in YOUR decision.
  const move = [
    "**Your move** — I won't pick for you.",
    "Tell me a direction (**A, B, C, or D**), or hand me a real consolidation offer (rate + term) and I'll model it exactly. Say the word and I'll build the month-by-month plan for whichever path you choose.",
  ];

  const disclaimer = "_This is grounded decision-support from the figures you gave — not licensed debt advice, and no lender's acceptance is guaranteed. For a formal plan, a licensed credit counsellor is the right next stop._";

  const notes: string[] = [];
  if (opts.assumedMinimums) {
    notes.push("_For any debt without a stated minimum, I assumed the greater of 2% of the balance or 25/mo — tell me the real minimums to tighten this._");
  }

  return [verdict, "", ...picture, "", ...options, "", ...move, "", disclaimer, ...(notes.length ? ["", ...notes] : [])].join("\n");
}
