/**
 * Advisor gateway (ADR-025, Step 2b) — Finance-only. On an open request for a
 * plan or guidance, it reads the user's stored profile (and their liquid-cash
 * context if set), composes a grounded plan via the synthesis engine, and streams
 * it before the model runs. With an incomplete profile it refuses and asks for
 * the missing facts rather than inventing them.
 *
 * Isolation: returns false unless studioDomain is 'finance' AND the turn is an
 * advice request. It is wired AFTER the specific engines (fx / debt / savings),
 * so a concrete calculation is still handled deterministically by those.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { requireActiveSession } from "./authz.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { isUserContextStoreConfigured, readUserContextGraph } from "./user-context-store.js";
import { userContextNodesForKey } from "./user-context-graph.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";
import { parseAdviceIntent } from "./finance-advisor-intent.js";
import { readFinancialProfile } from "./financial-profile.js";
import { readBalanceSheet } from "./financial-balance-sheet.js";
import { buildAdvisoryPlan, formatAdvisoryPlan } from "./finance-advisor-synthesis.js";

const ADVISOR_RATE_LIMIT_PER_MINUTE = 60;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Advisor",
    modelId: "quantora-advisor-synthesis-v1",
    requestId,
    liveConnected: true,
    deterministic: true,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

/** Current liquid cash from stored context, if the user has set it. */
function currentLiquidCash(graph: unknown): number | undefined {
  const node = userContextNodesForKey(graph, "finance.liquid_cash", { minConfidence: 0.5 })[0];
  return typeof node?.value.amount === "number" ? node.value.amount : undefined;
}

export function handleFinanceAdvisor(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("finance-advisor", res, () => runFinanceAdvisor(req, res));
}

async function runFinanceAdvisor(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;
  if (!parseAdviceIntent(req.body?.message).matched) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `advisor:user:${session.sub}` : `advisor:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, ADVISOR_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many advisor requests. Please wait a minute and try again." });
    return true;
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return true;
  const sub = auth.value.sessionUser!.sub;

  if (!isUserContextStoreConfigured()) {
    res.status(503).json({ error: "Quantora personal context is not configured on this deployment yet.", requestId });
    return true;
  }

  const graph = await readUserContextGraph(sub);
  const profile = readFinancialProfile(graph);
  const balanceSheet = readBalanceSheet(graph);
  const plan = buildAdvisoryPlan(profile, { current: currentLiquidCash(graph), balanceSheet });
  sendStream(res, requestId, formatAdvisoryPlan(plan));
  return true;
}
