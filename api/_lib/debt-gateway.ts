/**
 * Deterministic debt-payoff gateway (ADR-025, P3) — Finance-only, same shape as
 * the affordability and market-data gateways. On a Finance turn that asks for a
 * debt-payoff / consolidation plan with concrete numbers, it computes the
 * avalanche vs snowball comparison and answers deterministically before the
 * model runs. It needs no market data and no stored context — the arithmetic is
 * done from the numbers in the message.
 *
 * Isolation: returns false unless studioDomain is 'finance' AND the turn is a
 * debt-plan request. Every other domain and message flows through normal chat.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { parseDebtIntent } from "./debt-intent.js";
import { comparePayoff, formatDebtPlan } from "./debt-payoff.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";

const DEBT_RATE_LIMIT_PER_MINUTE = 60;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Debt Engine",
    modelId: "quantora-debt-payoff-v1",
    requestId,
    liveConnected: true,
    deterministic: true,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

export async function handleDebtPlan(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;
  const intent = parseDebtIntent(req.body?.message);
  if (!intent.matched) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `debt:user:${session.sub}` : `debt:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, DEBT_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many debt-plan requests. Please wait a minute and try again." });
    return true;
  }

  if (!intent.debts.length || (intent.extraMonthly === null && intent.statedIncome === null)) {
    /*
     * Same defect as the savings gateway: parseDebtIntent reports matched:true on
     * the trigger word alone, so "how does debt affect my credit score?" consumed
     * the turn and returned a demand for balances and APRs, every time, with no
     * way through to the model. The planner still needs real numbers — it simply
     * must not end the turn to say so.
     */
    return false;
  }

  /*
   * A stated income is a constraint, not a budget. When the minimums exceed it
   * the simulator says so and formatDebtPlan prints the shortfall instead of a
   * payoff date — the one answer that is both derivable and true for someone
   * whose obligations are larger than their income.
   */
  /*
   * With debts and an income but no stated extra, "nothing on top of the
   * minimums" is the right reading — and it is the reading that lets the
   * shortfall check below fire for the person who most needs it.
   */
  const comparison = comparePayoff(intent.debts, intent.extraMonthly ?? 0, intent.statedIncome);
  sendStream(res, requestId, formatDebtPlan(comparison, { assumedMinimums: intent.assumedMinimums }));
  return true;
}
