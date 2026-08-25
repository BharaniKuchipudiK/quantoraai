/**
 * Deterministic savings-goal gateway (ADR-025, P3) — Finance-only, same shape as
 * the affordability, market-data, and debt gateways. On a Finance turn asking
 * whether a savings goal is reachable, it projects the outcome deterministically
 * (on track? required monthly? time to goal?) before the model runs. No market
 * data and no stored context — the arithmetic is done from the message.
 *
 * Isolation: returns false unless studioDomain is 'finance' AND the turn is a
 * savings-goal request.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { parseSavingsIntent } from "./savings-goal-intent.js";
import { projectSavings, formatSavingsPlan } from "./savings-goal.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";

const SAVINGS_RATE_LIMIT_PER_MINUTE = 60;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Savings Engine",
    modelId: "quantora-savings-goal-v1",
    requestId,
    liveConnected: true,
    deterministic: true,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

export function handleSavingsGoal(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("savings-goal", res, () => runSavingsGoal(req, res));
}

async function runSavingsGoal(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;
  const intent = parseSavingsIntent(req.body?.message);
  if (!intent.matched) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `savings:user:${session.sub}` : `savings:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, SAVINGS_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many savings-plan requests. Please wait a minute and try again." });
    return true;
  }

  if (intent.goal === null || intent.months === null || intent.monthly === null) {
    sendStream(
      res,
      requestId,
      "I can project a savings goal, but I need three things explicitly: the **target amount**, the **timeframe**, and how much you can **save each month** (a starting balance and expected return are optional) — for example: *“save $20,000 in 3 years, I have $2,000 now and can put away $400/month at 4%”*. I won't assume the numbers.",
    );
    return true;
  }

  const inputs = {
    goal: intent.goal,
    current: intent.current,
    monthly: intent.monthly,
    annualRatePct: intent.annualRatePct,
    months: intent.months,
  };
  sendStream(res, requestId, formatSavingsPlan(inputs, projectSavings(inputs)));
  return true;
}
