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

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return true;
  const sub = auth.value.sessionUser!.sub;

  if (!isUserContextStoreConfigured()) {
    res.status(503).json({ error: "Quantora personal context is not configured on this deployment yet.", requestId });
    return true;
  }

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
  // Minimums are always estimated for now (the balance sheet doesn't store them yet).
  sendStream(res, requestId, formatCrisisPlan(plan, { assumedMinimums: true }));
  return true;
}
