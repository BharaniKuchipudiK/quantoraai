/**
 * Financial-profile gateway (ADR-025, Step 2a) — Finance-only. Handles two turns:
 *  - an explicit profile command ("Set my goal to SGD 1,000,000 in 20 years")
 *    → stores it in the user-context graph and confirms;
 *  - a profile read-back ("show my profile") → renders what's stored and what's
 *    still missing.
 *
 * Isolation: returns false unless studioDomain is 'finance' AND the turn is a
 * profile command or a profile query. Storage reuses the same owner-scoped,
 * user-approved path as the affordability context commands — nothing is inferred.
 */

import { randomUUID } from "node:crypto";
import { normalizeStudioDomain } from "./studio-domains.js";
import { requireActiveSession } from "./authz.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { isUserContextStoreConfigured, readUserContextGraph, saveUserContextNode } from "./user-context-store.js";
import { guardFinanceGateway } from "./finance-gateway-guard.js";
import {
  parseFinancialProfileCommand,
  profileNode,
  readFinancialProfile,
  formatProfile,
  type FinancialProfileCommand,
} from "./financial-profile.js";
import { isProfileShowQuery } from "./finance-advisor-intent.js";

const PROFILE_RATE_LIMIT_PER_MINUTE = 60;

function sendStream(res: any, requestId: string, text: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Finance Profile",
    modelId: "quantora-finance-profile-v1",
    requestId,
    liveConnected: true,
    deterministic: true,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function confirmation(command: FinancialProfileCommand): string {
  if (command.kind === "set_goal") {
    const horizon = command.horizonYears ? ` in ${command.horizonYears} years` : "";
    return `Saved: **goal = ${command.currency} ${command.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}${horizon}**.`;
  }
  if (command.kind === "set_risk") return `Saved: **risk tolerance = ${command.risk}**.`;
  if (command.kind === "set_horizon") return `Saved: **time horizon = ${command.horizonYears} years**.`;
  return `Saved: **monthly investable = ${command.currency} ${command.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}**.`;
}

export function handleFinancialProfile(req: any, res: any): Promise<boolean> {
  return guardFinanceGateway("financial-profile", res, () => runFinancialProfile(req, res));
}

async function runFinancialProfile(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (normalizeStudioDomain(req.body?.studioDomain) !== "finance") return false;

  const command = parseFinancialProfileCommand(req.body?.message);
  const showQuery = command ? false : isProfileShowQuery(req.body?.message);
  if (!command && !showQuery) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `profile:user:${session.sub}` : `profile:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, PROFILE_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many profile requests. Please wait a minute and try again." });
    return true;
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return true;
  const sub = auth.value.sessionUser!.sub;

  if (!isUserContextStoreConfigured()) {
    res.status(503).json({ error: "Quantora personal context is not configured on this deployment yet.", requestId });
    return true;
  }

  if (command) {
    const saved = await saveUserContextNode(sub, profileNode(command, requestId));
    if (!saved) {
      res.status(503).json({ error: "Quantora could not save your profile right now.", requestId });
      return true;
    }
    const profile = readFinancialProfile(await readUserContextGraph(sub));
    sendStream(res, requestId, `${confirmation(command)}\n\n${formatProfile(profile)}`);
    return true;
  }

  // Read-back.
  const profile = readFinancialProfile(await readUserContextGraph(sub));
  sendStream(res, requestId, formatProfile(profile));
  return true;
}
