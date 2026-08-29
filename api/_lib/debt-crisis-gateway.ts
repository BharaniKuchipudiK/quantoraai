/**
 * Debt-crisis / consolidation gateway (ADR-025, Phase B) — Finance-only. On a
 * whole-situation debt ask it synthesizes the stored picture (income, essential
 * expenses, every liability) and streams a decisive, options-on-the-table plan
 * that ends in the user's decision — human-in-the-loop, never auto-chosen.
 *
 * It reads the balance sheet the user built (Phase A). If the essentials to run
 * the numbers aren't set, it says exactly what to add rather than guessing.
 *
 * Isolation: returns false unless studioDomain is 'finance' AND the turn is a
 * debt-crisis request; routed through the shared resilience guard. Wired BEFORE
 * the point payoff gateway so a "consolidate" ask isn't captured as a payoff.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { requireActiveSession } from "./authz.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { isUserContextStoreConfigured, readUserContextGraph } from "./user-context-store.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";
import { withNextMoves } from "./deterministic-turn.js";
import { parseDebtCrisisIntent } from "./debt-crisis-intent.js";
import { readBalanceSheet } from "./financial-balance-sheet.js";
import { buildCrisisPlan, formatCrisisPlan } from "./debt-crisis.js";
import type { Debt } from "./debt-payoff.js";

const CRISIS_RATE_LIMIT_PER_MINUTE = 60;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({ provider: "Quantora Debt Strategist", modelId: "quantora-debt-crisis-v1", requestId, liveConnected: true, deterministic: true })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

/** Conventional minimum when the user hasn't stated one: greater of 2% of balance or 25. */
function estimatedMinimum(balance: number): number {
  return Number(Math.max(balance * 0.02, 25).toFixed(2));
}

export function handleDebtCrisis(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("debt-crisis", res, () => runDebtCrisis(req, res));
}

async function runDebtCrisis(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;
  const intent = parseDebtCrisisIntent(req.body?.message);
  if (!intent.matched) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `debtcrisis:user:${session.sub}` : `debtcrisis:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, CRISIS_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many debt-strategy requests. Please wait a minute and try again." });
    return true;
  }

  /*
   * NEITHER OF THESE MAY END THE TURN.
   *
   * This gateway is wired ahead of the payoff gateway so a "consolidate" ask is
   * not captured as a point payoff. That ordering also means it is the first
   * thing a consolidation question meets — and it needs a session and a
   * configured store, because it reads the balance sheet the user built.
   *
   * The payoff gateway behind it needs neither: it answers from the numbers in
   * the message. So consuming the turn here handed a signed-out user "Sign in
   * to continue" for a question the platform could already answer without an
   * account, and did answer before this gateway existed.
   *
   * Falling through costs nothing and touches no personal data — the turn goes
   * to the engine that can serve it from what the user typed. This is the same
   * rule the savings and payoff gateways each learned the hard way: declining
   * to RUN is not a reason to end the TURN.
   */
  if (!getSessionUser(req) || !isUserContextStoreConfigured()) return false;

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return true;
  const sub = auth.value.sessionUser!.sub;

  const bs = readBalanceSheet(await readUserContextGraph(sub));

  // Need income, essentials, and at least one debt to synthesize anything real.
  const missing: string[] = [];
  if (bs.incomeMonthly === null) missing.push("`Set my monthly income to <amount>`");
  if (bs.expensesMonthly === null) missing.push("`Set my monthly expenses to <amount>` (your non-debt essentials)");
  if (bs.liabilities.length === 0) missing.push("`Add liability: <name>, <balance> at <APR>%` for each debt");
  if (missing.length || bs.mixedCurrency) {
    const reason = bs.mixedCurrency
      ? "Your figures span more than one currency; I won't mix them into one plan without a conversion — set them in a single currency (or tell me a base currency to convert to)."
      : `I won't guess a debt plan — I need the full picture first. Please set:\n\n${missing.map((h) => `- ${h}`).join("\n")}`;
    sendStream(res, requestId, `Before I can bridge the gap, I need your real numbers.\n\n${reason}\n\nOnce those are in, ask again and I'll lay out every option.`);
    return true;
  }

  const currency = bs.currency || bs.liabilities[0]?.currency || "";
  const debts: Debt[] = bs.liabilities.map((l) => ({
    name: l.label,
    balance: l.amount,
    apr: l.aprPct ?? 0,
    minPayment: estimatedMinimum(l.amount),
  }));

  const plan = buildCrisisPlan(
    { incomeMonthly: bs.incomeMonthly!, essentialExpenses: bs.expensesMonthly!, debts, currency },
    { offer: intent.offer || undefined },
  );
  /*
   * The plan ended by asking the reader to "tell me a direction (A, B, C, or
   * D)" — in prose, with nothing on the next turn able to parse a bare "A".
   * Human-in-the-loop in intent, a dead end in practice: a deterministic
   * gateway returns out of api/pipeline.ts before the conversation engine runs,
   * so the follow-ups have to travel with the answer.
   *
   * Each option below is a whole sentence the platform can actually act on,
   * because it is what gets posted as the user's next message.
   */
  const a = plan.assessment;
  const highest = a.highestApr ? `${a.highestApr.name} at ${a.highestApr.apr}%` : "the highest-rate debt";
  // Minimums are always estimated for now (the balance sheet doesn't store them yet).
  sendStream(res, requestId, withNextMoves({
    text: formatCrisisPlan(plan, { assumedMinimums: true }),
    question: "Which direction do you want to take?",
    moves: [
      {
        id: "crisis_consolidate",
        title: "A — Model a consolidation",
        description: "Give me a rate and term and I'll test it against your gap",
        value: "Model a consolidation loan against my situation — I'll give you the rate and the term I've been offered.",
      },
      {
        id: "crisis_attack",
        title: "B — Attack it as it stands",
        description: "Payoff order without consolidating",
        value: "Show me the payoff order if I don't consolidate and just attack these debts as they stand.",
      },
      {
        id: "crisis_gap",
        title: "C — Work on the gap",
        description: "Where the shortfall could close",
        value: "Work through where the gap could close — walk me through my income and essentials.",
      },
      {
        id: "crisis_negotiate",
        title: "D — Negotiate",
        description: `What to say to ${highest}`,
        value: `What should I say when I call the lender for ${highest} to ask for a hardship rate?`,
      },
    ],
    facts: [
      `Monthly income ${a.incomeMonthly}, essentials ${a.essentialExpenses}, available for debt ${a.availableForDebt} ${currency}`.trim(),
      `Total debt ${a.totalBalance} across ${debts.length} liabilit${debts.length === 1 ? "y" : "ies"}; minimums ${a.totalMinPayments}; severity ${a.severity}`,
    ],
  }));
  return true;
}
