import { randomUUID } from "node:crypto";
import { evaluateAffordability, type AffordabilityDecision } from "./affordability.js";
import { parseAffordabilityIntent } from "./affordability-intent.js";
import { requireActiveSession } from "./authz.js";
import { endOfUtcDay, parseFinancialContextCommand, type FinancialContextCommand } from "./financial-context-command.js";
import { applyCors, clientIp, isRateLimited } from "./rate-limit.js";
import { getSessionUser } from "./session.js";
import { isUserContextStoreConfigured, readUserContextGraph, saveUserContextNode } from "./user-context-store.js";

const DECISION_RATE_LIMIT_PER_MINUTE = 60;

function money(currency: string, amount: number | null): string {
  return amount === null ? "unknown" : `${currency} ${amount.toFixed(2)}`;
}

function setupHints(decision: AffordabilityDecision): string[] {
  const hints: string[] = [];
  if (decision.missing.some((item) => item.startsWith("finance.liquid_cash"))) {
    hints.push(`- \`Set my liquid cash to ${decision.currency || "SGD"} <amount>\``);
  }
  if (decision.missing.some((item) => item.startsWith("finance.minimum_reserve"))) {
    hints.push(`- \`Set my minimum reserve to ${decision.currency || "SGD"} <amount>\``);
  }
  const coverage = decision.missing.find((item) => item.startsWith("finance.commitments_reviewed_through"));
  if (coverage) {
    const date = coverage.match(/>=\s+(\d{4}-\d{2}-\d{2})/)?.[1] || decision.horizonEnd.slice(0, 10);
    hints.push(`- Add any known obligation first with \`Add commitment: <name>, ${decision.currency || "SGD"} <amount>, due YYYY-MM-DD\``);
    hints.push(`- Then confirm coverage with \`Commitments reviewed through ${date}\``);
  }
  return hints;
}

export function formatAffordabilityResponse(decision: AffordabilityDecision): string {
  if (decision.verdict === "insufficient_data") {
    const hints = setupHints(decision);
    return [
      "I can't give you a safe yes/no yet.",
      "",
      `I'm missing: **${decision.missing.join(", ") || "required financial guardrails"}**.`,
      "",
      "Quantora won't assume unrecorded commitments are zero or treat portfolio value, market gains, inferred income, or an assumed FX rate as spendable cash.",
      ...(hints.length ? ["", "**To complete the baseline:**", ...hints] : []),
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
  contextSaved?: string | null;
}) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ text: payload.text })}\n\n`);
  res.write(`data: ${JSON.stringify({
    provider: "Quantora Decision Engine",
    modelId: "quantora-personal-decision-v1",
    requestId: payload.requestId,
    liveConnected: true,
    deterministic: true,
    ...(payload.decision ? { affordability: payload.decision } : {}),
    ...(payload.contextSaved ? { contextSaved: payload.contextSaved } : {}),
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function contextNodeForCommand(command: FinancialContextCommand, requestId: string) {
  const common = {
    provenance: "user" as const,
    confidence: 1,
    sourceRef: `chat-explicit:${requestId}`,
  };

  if (command.kind === "set_liquid_cash") {
    return {
      ...common,
      category: "financial_state" as const,
      key: "finance.liquid_cash",
      value: { amount: command.amount, currency: command.currency },
    };
  }
  if (command.kind === "set_minimum_reserve") {
    return {
      ...common,
      category: "constraint" as const,
      key: "finance.minimum_reserve",
      value: { amount: command.amount, currency: command.currency },
    };
  }
  if (command.kind === "set_commitments_reviewed_through") {
    return {
      ...common,
      category: "fact" as const,
      key: "finance.commitments_reviewed_through",
      value: { date: endOfUtcDay(command.reviewedThrough) },
    };
  }
  return {
    ...common,
    category: "commitment" as const,
    key: command.key,
    value: {
      text: command.label,
      amount: command.amount,
      currency: command.currency,
      date: endOfUtcDay(command.dueDate),
    },
  };
}

function contextConfirmation(command: FinancialContextCommand): string {
  if (command.kind === "set_liquid_cash") {
    return `Saved: **liquid cash = ${money(command.currency, command.amount)}**.`;
  }
  if (command.kind === "set_minimum_reserve") {
    return `Saved: **minimum reserve = ${money(command.currency, command.amount)}**.`;
  }
  if (command.kind === "set_commitments_reviewed_through") {
    return `Saved: **commitments reviewed through ${command.reviewedThrough}**.`;
  }
  return `Saved commitment: **${command.label} — ${money(command.currency, command.amount)}, due ${command.dueDate}**.`;
}

/**
 * Narrow deterministic gateway in front of ordinary chat. It handles only:
 * 1) explicit user-approved financial context commands, and
 * 2) explicit affordability questions.
 * Everything else returns false and continues through the existing chat runtime.
 */
export async function handleAffordabilityDecision(req: any, res: any): Promise<boolean> {
  if (req.method !== "POST") return false;
  const command = parseFinancialContextCommand(req.body?.message);
  const intent = parseAffordabilityIntent(req.body?.message);
  if (!command && !intent.matched) return false;

  applyCors(req, res, "POST,OPTIONS");
  const requestId = randomUUID();
  const session = getSessionUser(req);
  const limitKey = session ? `decision:user:${session.sub}` : `decision:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, DECISION_RATE_LIMIT_PER_MINUTE, 60_000)) {
    res.status(429).json({ error: "Too many decision requests. Please wait a minute and try again." });
    return true;
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return true;

  if (!isUserContextStoreConfigured()) {
    /*
     * An explicit context command ("set liquid cash to SGD 3,000") is a WRITE the
     * user asked for. Falling through would send it to ordinary chat, save
     * nothing, and leave the model with no signal that persistence failed - so a
     * later affordability answer could rely on a fact that was never stored.
     * Commands keep the explicit failure.
     *
     * A conversational affordability question stores nothing either way, so
     * ending the turn on it only produced a permanent "Request failed" in every
     * workspace (this gateway is not domain-gated). That case falls through.
     */
    if (command) {
      res.status(503).json({
        error: "Quantora personal context is not configured on this deployment yet, so this could not be saved.",
        requestId,
      });
      return true;
    }
    return false;
  }

  if (command) {
    const saved = await saveUserContextNode(auth.value.sessionUser!.sub, contextNodeForCommand(command, requestId));
    if (!saved) {
      res.status(503).json({ error: "Quantora could not save this personal context right now.", requestId });
      return true;
    }
    sendStream(res, {
      requestId,
      contextSaved: saved.key,
      text: `${contextConfirmation(command)}\n\nThis was stored because you used an explicit financial-context command; ordinary conversation is not silently captured.`,
    });
    return true;
  }

  if (!intent.currency || intent.proposedCost === null) {
    /*
     * The intent matches on "can I afford" alone and a bare "$" is deliberately
     * not mapped to a currency, so "Can I afford to move to Berlin?" and
     * "can I afford a $1,200 rent?" both landed here and were answered with the
     * same demand for an ISO currency — permanently, since rephrasing keeps the
     * trigger. Refusing to GUESS the currency is right; ending the turn is not.
     */
    return false;
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
