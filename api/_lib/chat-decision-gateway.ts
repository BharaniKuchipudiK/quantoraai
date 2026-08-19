import { randomUUID } from "node:crypto";
import { evaluateAffordability, type AffordabilityDecision } from "./affordability.js";
import { parseAffordabilityIntent } from "./affordability-intent.js";
import { requireActiveSession } from "./authz.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { isUserContextStoreConfigured, readUserContextGraph } from "./user-context-store.js";

const DECISION_RATE_LIMIT_PER_MINUTE = 60;

function money(currency: string, amount: number | null): string {
  return amount === null ? "unknown" : `${currency} ${amount.toFixed(2)}`;
}

export function formatAffordabilityResponse(decision: AffordabilityDecision): string {
  if (decision.verdict === "insufficient_data") {
    return [
      "I can't give you a safe yes/no yet.",
      "",
      `I'm missing: **${decision.missing.join(", ") || "required financial guardrails"}**.`,
      "",
      "Quantora won't treat portfolio value, market gains, inferred income, or an assumed FX rate as spendable cash. Once the missing inputs are available, I'll calculate the decision from your actual cash, commitments and protected reserve.",
    ].join("\n");
  }

  const headline = decision.verdict === "comfortable"
    ? "**Yes — this is within your current safe-spend guardrail.**"
    : decision.verdict === "possible_but_tight"
      ? "**You can technically afford it, but it would leave your finances tight.**"
      : "**No — this is above your current safe-spend guardrail.**";

  return [
    headline,
    "",
    `Proposed spend: **${money(decision.currency, decision.proposedCost)}**`,
    `Safe discretionary spend: **${money(decision.currency, decision.safeSpend)}**`,
    `Headroom after this spend: **${money(decision.currency, decision.headroom)}**`,
    "",
    "**What I used**",
    `- Liquid cash: ${money(decision.currency, decision.liquidCash)}`,
    `- Known inflows through ${decision.horizonEnd.slice(0, 10)}: ${money(decision.currency, decision.expectedInflows)}`,
    `- Known commitments through ${decision.horizonEnd.slice(0, 10)}: ${money(decision.currency, decision.commitments)}`,
    `- Protected reserve: ${money(decision.currency, decision.minimumReserve)}`,
    "",
    "This is a deterministic cash-flow decision from your stored Quantora context — not a guess from the language model.",
  ].join("\n");
}

function sendStream(res: any, payload: {
  text: string;
  requestId: string;
  decision?: AffordabilityDecision | null;
}) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text: payload.text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Decision Engine",
    modelId: "quantora-affordability-v1",
    requestId: payload.requestId,
    liveConnected: true,
    deterministic: true,
    ...(payload.decision ? { affordability: payload.decision } : {}),
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

/**
 * Intercept only explicit affordability questions. Returns false when the
 * ordinary chat runtime should continue unchanged.
 */
export async function handleAffordabilityDecision(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  const intent = parseAffordabilityIntent(req.body?.message);
  if (!intent.matched) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `decision:user:${session.sub}` : `decision:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, DECISION_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many decision requests. Please wait a minute and try again." });
    return true;
  }

  if (!intent.currency || intent.proposedCost === null) {
    sendStream(res, {
      requestId,
      text: "I can calculate that, but I need an **explicit currency and amount** — for example, `SGD 3,000`. I won't guess what a plain `$` means.",
    });
    return true;
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return true;

  if (!isUserContextStoreConfigured()) {
    res.status(503).json({
      error: "Quantora personal context is not configured on this deployment yet.",
      requestId,
    });
    return true;
  }

  const graph = await readUserContextGraph(auth.value.sessionUser!.sub);
  const decision = evaluateAffordability({
    graph,
    proposedCost: intent.proposedCost,
    currency: intent.currency,
    asOf: new Date(),
    horizonDays: 90,
  });

  sendStream(res, {
    requestId,
    decision,
    text: formatAffordabilityResponse(decision),
  });
  return true;
}
