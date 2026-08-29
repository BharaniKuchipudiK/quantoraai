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
import { composeDebtTurn } from "./debt-conversation.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";

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

export function handleDebtPlan(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("debt-plan", res, () => runDebtPlan(req, res));
}

async function runDebtPlan(req: any, res: any): Promise<boolean> {
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

  /*
   * Same defect as the savings gateway: parseDebtIntent reports matched:true on
   * the trigger word alone, so "how does debt affect my credit score?" consumed
   * the turn and returned a demand for balances and APRs, every time, with no
   * way through to the model. composeDebtTurn returns null on anything it cannot
   * answer from arithmetic, and the turn stays a conversation.
   */
  const move = composeDebtTurn(intent);
  if (!move) return false;

  sendStream(res, requestId, move.text);
  return true;
}
