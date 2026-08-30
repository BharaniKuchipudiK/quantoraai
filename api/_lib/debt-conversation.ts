/**
 * Turns a debt turn into a conversational MOVE rather than a verdict.
 *
 * The four deterministic gateways each computed an answer, streamed it, and
 * returned out of api/pipeline.ts before the conversation engine ran — so a
 * money question got one block of text and a dead end. An advisor does not work
 * that way: they resolve the ambiguity that changes everything, answer with the
 * arithmetic, and leave the next move on the table.
 *
 * Every move here is deterministic. The follow-ups are the questions this
 * engine can actually answer, never open-ended invitations to a model that
 * would have to invent the numbers.
 */

import type { Debt } from "./debt-payoff.js";
import { comparePayoff, formatDebtPlan } from "./debt-payoff.js";
import { buildDebtProgram, formatDebtProgram } from "./debt-program.js";
import type { DebtIntent } from "./debt-intent.js";
import { withNextMoves } from "./deterministic-turn.js";
import {
  aprToFitPayment,
  blendedApr,
  evaluateConsolidation,
  termToFitPayment,
  type ConsolidationOffer,
} from "./debt-consolidation.js";

export type DebtMoveKind = "ask-capacity" | "shortfall" | "consolidation" | "plan";

export type DebtMove = {
  kind: DebtMoveKind;
  /** Streamed verbatim: prose, then the decision card, then the memory comment. */
  text: string;
};


function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function termLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years && rem) return `${years} yr ${rem} mo`;
  if (years) return `${years} yr`;
  return `${months} mo`;
}

function debtFacts(debts: Debt[], intent: DebtIntent): string[] {
  const facts = debts.map((d) => `Debt: ${money(d.balance)} at ${d.apr}% APR, minimum ${money(d.minPayment)}/month`);
  if (intent.statedIncome !== null) facts.push(`Monthly income stated: ${money(intent.statedIncome)}`);
  if (intent.extraMonthly !== null) facts.push(`Spare each month beyond minimums: ${money(intent.extraMonthly)}`);
  return facts;
}

function minimumsOf(debts: Debt[]): number {
  return Number(debts.reduce((sum, d) => sum + Math.max(0, d.minPayment), 0).toFixed(2));
}

/**
 * The one question worth asking before any arithmetic. "25K of debt" and "25K of
 * payments each month" are different emergencies, and a planner that assumes
 * either one is guessing about someone's rent.
 */
function askCapacity(debts: Debt[], intent: DebtIntent): DebtMove {
  const minimums = minimumsOf(debts);
  const text =
    `I have your ${debts.length === 1 ? "debt" : `${debts.length} debts`} — ` +
    `minimum payments come to **${money(minimums)} a month**.\n\n` +
    `Before I plan anything I need to know what that lands against, because it changes the answer completely. ` +
    `A plan built on the wrong assumption about your income is worse than no plan.`;
  return {
    kind: "ask-capacity",
    text: withNextMoves({
      text,
      question: "Where do those payments sit against your month?",
      moves: [
        {
          id: "debt_room",
          title: "I have room beyond the minimums",
          description: "You can pay more than the minimum each month",
          value: "I can cover the minimums and have room beyond them each month — I'll tell you how much.",
        },
        {
          id: "debt_exact",
          title: "The minimums are all I can manage",
          description: "Nothing spare after essentials",
          value: "I can cover the minimum payments but have nothing spare each month.",
        },
        {
          id: "debt_short",
          title: "My payments exceed what comes in",
          description: "The obligations are larger than the income",
          value: "My debt payments already exceed my monthly income — I'll tell you both numbers.",
        },
      ],
      facts: debtFacts(debts, intent),
    }),
  };
}

/**
 * The shortfall move. It states the gap and then does the only useful piece of
 * arithmetic left: what a payment would have to look like to fit, expressed as
 * the rate and the term a lender would have to offer. That is a modelled
 * requirement, never a claim that anyone will offer it.
 */
function shortfall(debts: Debt[], intent: DebtIntent, affordable: number): DebtMove {
  const minimums = minimumsOf(debts);
  const principal = Number(debts.reduce((sum, d) => sum + Math.max(0, d.balance), 0).toFixed(2));
  const gap = Number((minimums - affordable).toFixed(2));
  const blended = blendedApr(debts);

  const lines = [
    `Your minimums total **${money(minimums)} a month** against **${money(affordable)}** coming in — ` +
      `a shortfall of **${money(gap)} every month**.`,
    "",
    `I'm not going to give you a payoff date, because any date I printed would assume money that isn't there. ` +
      `What matters now is the payment itself, not the payoff order.`,
  ];

  /*
   * The ceiling, and it must be labelled as one. `affordable` here is the stated
   * INCOME, and nobody can put their whole income against debt — they have to
   * live. Solving at that figure gives the most optimistic case that arithmetic
   * allows, which is useful only if it is never presented as a plan. Quoting it
   * as "your payment" would repeat, one layer up, the exact confusion between
   * income and payment capacity that produced the wrong answer in the first
   * place.
   */
  const termAtBlended = termToFitPayment(principal, blended, affordable);
  const aprAtFive = aprToFitPayment(principal, 60, affordable);
  const requirements: string[] = [];
  if (termAtBlended) {
    requirements.push(`- At your blended rate of **${blended.toFixed(2)}%**, one loan of ${money(principal)} would clear in **${termLabel(termAtBlended)}** — but only if every ${money(affordable)} went to debt and nothing to living.`);
  } else {
    requirements.push(`- At your blended rate of **${blended.toFixed(2)}%**, even the whole ${money(affordable)} does not cover the interest on ${money(principal)}. No term is long enough; the rate itself has to come down.`);
  }
  if (aprAtFive === null) {
    requirements.push(`- Over 5 years, ${money(principal)} costs more than ${money(affordable)}/month even at 0% — that term is too short whatever the rate.`);
  } else if (aprAtFive >= blended) {
    requirements.push(`- Over 5 years the rate is not the binding constraint — the term is. Stretching the term is the lever here, not shopping the rate.`);
  } else {
    requirements.push(`- Over a 5-year term the rate would have to fall to **${aprAtFive.toFixed(2)}%** — below the ${blended.toFixed(2)}% you pay now — for the payment to fit even that ceiling.`);
  }

  lines.push(
    "",
    `Two things could move this, so here is the outer limit of each — measured against your **whole** income, which is a ceiling nobody actually reaches:`,
    ...requirements,
  );
  lines.push(
    "",
    `To turn that ceiling into a real number I need what is left after rent, food and the rest. Those are requirements, not offers — whether a lender restructures at any rate is their decision, and a credit counsellor can negotiate terms a calculator cannot.`,
  );

  return {
    kind: "shortfall",
    text: withNextMoves({
      text: lines.join("\n"),
      question: "What should I work out next?",
      moves: [
        {
          id: "debt_offer",
          title: "I have an offer — check it",
          description: "Give me a rate and term and I'll test it against this gap",
          value: "I've been offered a consolidation loan — I'll give you the rate and the term, tell me whether it closes the gap.",
        },
        {
          id: "debt_order",
          title: "Which debt costs me most",
          description: "Rank what to attack if anything frees up",
          value: "Show me which of these debts is costing me the most, so I know what to attack first if anything frees up.",
        },
        {
          id: "debt_cut",
          title: "Here's what I can really pay",
          description: "Your income minus living costs — the number that makes this real",
          value: "Here is what I can actually put toward debt each month after rent, food and essentials — work backwards from that.",
        },
      ],
      facts: [...debtFacts(debts, intent), `Monthly shortfall against minimums: ${money(gap)}`],
    }),
  };
}

/** An offer on the table: does it help, and what does the relief cost in interest? */
function consolidation(debts: Debt[], intent: DebtIntent, offer: ConsolidationOffer): DebtMove | null {
  const affordable = intent.statedIncome;
  const result = evaluateConsolidation(debts, offer, affordable);
  if (!result) return null;

  const lines = [
    `Consolidating **${money(result.principal)}** at **${offer.apr}%** over **${termLabel(offer.months)}**:`,
    "",
    `- New single payment: **${money(result.newPayment)}/month** (you pay ${money(result.currentMinimums)} now)`,
    `- ${result.monthlyRelief >= 0 ? `That frees **${money(result.monthlyRelief)} a month**` : `That is **${money(Math.abs(result.monthlyRelief))} a month more**`}`,
    `- Interest over the full term: **${money(result.newTotalInterest)}**`,
    `- Your blended rate today is ${result.blendedApr.toFixed(2)}%, so this offer ${result.ratesImprove ? "beats it" : "is **worse** than what you already pay"}`,
  ];

  if (result.fitsBudget === true) {
    lines.push(
      "",
      `That is under the ${money(affordable as number)} coming in — but income is not the test, what is left after living costs is. Tell me that figure and I'll say whether this actually fits.`,
    );
  } else if (result.fitsBudget === false) {
    lines.push(
      "",
      `This does not fit even against your **full** ${money(affordable as number)} income — it is still **${money(result.remainingShortfall as number)} a month short** before you have eaten. It narrows the gap without closing it.`,
    );
  }

  if (result.monthlyRelief > 0 && !result.ratesImprove) {
    lines.push(
      "",
      `Worth being clear about the trade: the monthly payment falls because the term is longer, not because the rate is better. You are buying breathing room with interest.`,
    );
  }

  return {
    kind: "consolidation",
    text: withNextMoves({
      text: lines.join("\n"),
      question: "Want me to test this further?",
      moves: [
        {
          id: "debt_offer_alt",
          title: "Compare another offer",
          description: "A different rate or term",
          value: "Compare that against a different consolidation offer — I'll give you the rate and term.",
        },
        {
          id: "debt_keep",
          title: "What if I keep them separate",
          description: "Payoff order without consolidating",
          value: "What happens if I don't consolidate and just pay these off in the best order?",
        },
      ],
      facts: [
        ...debtFacts(debts, intent),
        `Consolidation modelled: ${offer.apr}% over ${termLabel(offer.months)} = ${money(result.newPayment)}/month`,
      ],
    }),
  };
}

/** A workable plan — still ends with the next move, not a full stop. */
function plan(debts: Debt[], intent: DebtIntent): DebtMove {
  const comparison = comparePayoff(debts, intent.extraMonthly ?? 0, intent.statedIncome);

  /*
   * The plan proves the arithmetic. The program commits to it: "38 payments"
   * becomes a month, and the debts that vanish along the way get their own
   * months. Appended, never substituted — when no strategy is workable
   * (notably a shortfall, where the minimums already exceed the income) there
   * is no date to name, and the refusal above must stand alone rather than
   * being softened with one.
   */
  const program = buildDebtProgram(comparison, debts);
  const body = [formatDebtPlan(comparison, { assumedMinimums: intent.assumedMinimums })];
  if (program) body.push("", formatDebtProgram(program));

  return {
    kind: "plan",
    text: withNextMoves({
      text: body.join("\n"),
      question: "Where do you want to take this?",
      moves: [
        {
          id: "debt_more",
          title: "What if I pay more",
          description: "See what another increment buys",
          value: "What would it change if I put more toward the debt each month? I'll tell you how much more.",
        },
        {
          id: "debt_consolidate",
          title: "Would consolidating beat this",
          description: "Test one loan against the plan",
          value: "Would consolidating these into one loan beat this plan? I'll give you the rate and term I can get.",
        },
        {
          id: "debt_tight",
          title: "What if money gets tight",
          description: "Test the plan against a drop in income",
          value: "What happens to this plan if my income drops and I can only cover the minimums?",
        },
      ],
      facts: debtFacts(debts, intent),
    }),
  };
}

/**
 * Chooses the move. Returns null when there is nothing deterministic to say, so
 * the gateway falls through and the turn stays a conversation rather than
 * becoming a demand for numbers.
 */
export function composeDebtTurn(intent: DebtIntent): DebtMove | null {
  const debts = intent.debts;
  if (!debts.length) return null;

  if (intent.offer) {
    const move = consolidation(debts, intent, intent.offer);
    if (move) return move;
  }

  if (intent.statedIncome === null && intent.extraMonthly === null) return askCapacity(debts, intent);

  if (intent.statedIncome !== null && minimumsOf(debts) > intent.statedIncome) {
    return shortfall(debts, intent, intent.statedIncome);
  }

  return plan(debts, intent);
}
