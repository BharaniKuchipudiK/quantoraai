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
import { withNextMoves } from "./deterministic-turn.js";
import { parseSavingsIntent } from "./savings-goal-intent.js";
import { hasScenarioOpener } from "./finance-advisor-intent.js";
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
  // A "what if …" scenario belongs to the advisor (it models against the saved
  // profile), not this standalone calculator — even though its "save …/month"
  // figure would otherwise read here as a goal. Defer to keep the what-if whole.
  if (hasScenarioOpener(req.body?.message)) return false;
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
    /*
     * The trigger is the bare word "save", so "how can I save on taxes?" and
     * "should I save or invest?" match it. Consuming the turn here answered every
     * one of them with the same demand for three numbers, streamed as the
     * assistant, and the model was never called — the user could not escape it by
     * rephrasing, because rephrasing still contains "save".
     *
     * The projection needs explicit numbers, so it correctly declines to run. But
     * declining to RUN is not a reason to end the TURN: fall through to chat, which
     * can answer the question or ask for the numbers conversationally.
     */
    return false;
  }

  const inputs = {
    goal: intent.goal,
    current: intent.current,
    monthly: intent.monthly,
    annualRatePct: intent.annualRatePct,
    months: intent.months,
  };
  /*
   * A deterministic gateway returns out of api/pipeline.ts before the
   * conversation engine runs, so an answer that carries no follow-ups ends the
   * turn outright. The next moves offered here are the ones this engine can
   * actually compute — never an open invitation to a model that would have to
   * invent the numbers.
   */
  const projection = projectSavings(inputs);
  sendStream(res, requestId, withNextMoves({
    text: formatSavingsPlan(inputs, projection),
    question: projection.onTrack ? "Want to press on this?" : "What should I work out next?",
    moves: [
      {
        id: "savings_sooner",
        title: "What gets me there sooner",
        description: "Raise the monthly and see the new date",
        value: "What would it take to reach that goal sooner? I'll tell you what I could raise the monthly amount to.",
      },
      {
        id: "savings_rate",
        title: "What if the return is worse",
        description: "Test the plan against a lower rate",
        value: "What happens to this plan if the return is lower than assumed?",
      },
      {
        id: "savings_pause",
        title: "What if I have to stop for a while",
        description: "Test a break in contributions",
        value: "What happens to this plan if I have to stop contributing for a few months?",
      },
    ],
    facts: [
      `Savings goal: ${intent.goal} in ${intent.months} months`,
      `Saving ${intent.monthly}/month from ${intent.current}, ${intent.annualRatePct}% assumed return`,
    ],
  }));
  return true;
}
