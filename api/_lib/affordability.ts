import {
  activeUserContextNodes,
  userContextNodesForKey,
  type UserContextNode,
} from "./user-context-graph.js";

export type AffordabilityVerdict =
  | "comfortable"
  | "possible_but_tight"
  | "not_affordable"
  | "insufficient_data";

export type AffordabilityDecision = {
  verdict: AffordabilityVerdict;
  currency: string;
  proposedCost: number;
  safeSpend: number | null;
  headroom: number | null;
  liquidCash: number | null;
  expectedInflows: number;
  commitments: number;
  minimumReserve: number | null;
  horizonEnd: string;
  consideredNodeIds: string[];
  missing: string[];
  reasons: string[];
};

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(2))
    : null;
}

function currencyOf(node: UserContextNode): string | null {
  const currency = node.value.currency?.toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function amountOf(node: UserContextNode, currency: string): number | null {
  if (currencyOf(node) !== currency) return null;
  return money(node.value.amount);
}

function latestNode(nodes: UserContextNode[]): UserContextNode | null {
  return [...nodes].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || "") || 0;
    const bTime = Date.parse(b.updatedAt || "") || 0;
    return bTime - aTime;
  })[0] || null;
}

function datedWithinHorizon(node: UserContextNode, asOfMs: number, horizonMs: number): boolean {
  if (!node.value.date) return true;
  const due = Date.parse(node.value.date);
  return Number.isFinite(due) && due >= asOfMs && due <= horizonMs;
}

/**
 * Deterministic financial guardrail for the first Quantora vertical slice.
 *
 * Canonical context keys:
 * - finance.liquid_cash                   aggregate currently available liquid cash
 * - finance.minimum_reserve               cash floor the user does not want touched
 * - finance.commitments_reviewed_through  evidence that obligations were reviewed through the horizon
 * - finance.expected_inflow.*             dated/known inflows within the horizon
 * - finance.commitment.*                  dated/known obligations within the horizon
 *
 * This deliberately does not use portfolio value, market gains, or model
 * judgement as spendable cash. Absence of commitment rows is never interpreted
 * as zero obligations unless coverage explicitly confirms the review horizon.
 */
export function evaluateAffordability({
  graph,
  proposedCost,
  currency,
  asOf = new Date(),
  horizonDays = 90,
}: {
  graph: UserContextNode[] | unknown;
  proposedCost: number;
  currency: string;
  asOf?: string | Date;
  horizonDays?: number;
}): AffordabilityDecision {
  const normalizedCurrency = currency.trim().toUpperCase();
  const cost = money(proposedCost);
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const asOfMs = asOfDate.getTime();
  const safeHorizonDays = Math.max(1, Math.min(365, Math.floor(horizonDays || 90)));
  const horizon = new Date(asOfMs + safeHorizonDays * 24 * 60 * 60 * 1000);
  const horizonMs = horizon.getTime();

  if (cost === null || !/^[A-Z]{3}$/.test(normalizedCurrency) || !Number.isFinite(asOfMs)) {
    return {
      verdict: "insufficient_data",
      currency: /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : "",
      proposedCost: cost ?? 0,
      safeSpend: null,
      headroom: null,
      liquidCash: null,
      expectedInflows: 0,
      commitments: 0,
      minimumReserve: null,
      horizonEnd: Number.isFinite(horizonMs) ? horizon.toISOString() : "",
      consideredNodeIds: [],
      missing: ["valid proposed cost, currency and evaluation date"],
      reasons: ["Quantora cannot evaluate affordability without valid monetary inputs."],
    };
  }

  const active = activeUserContextNodes(graph, { asOf: asOfDate, minConfidence: 0.8 });
  const liquidNode = latestNode(userContextNodesForKey(active, "finance.liquid_cash", { asOf: asOfDate, minConfidence: 0.8 }));
  const reserveNode = latestNode(userContextNodesForKey(active, "finance.minimum_reserve", { asOf: asOfDate, minConfidence: 0.8 }));
  const commitmentCoverageNode = latestNode(userContextNodesForKey(
    active,
    "finance.commitments_reviewed_through",
    { asOf: asOfDate, minConfidence: 0.8 },
  ));

  const liquidCash = liquidNode ? amountOf(liquidNode, normalizedCurrency) : null;
  const minimumReserve = reserveNode ? amountOf(reserveNode, normalizedCurrency) : null;
  const commitmentCoverageMs = commitmentCoverageNode?.value.date
    ? Date.parse(commitmentCoverageNode.value.date)
    : Number.NaN;
  const missing: string[] = [];
  if (liquidCash === null) missing.push(`finance.liquid_cash in ${normalizedCurrency}`);
  if (minimumReserve === null) missing.push(`finance.minimum_reserve in ${normalizedCurrency}`);
  if (!Number.isFinite(commitmentCoverageMs) || commitmentCoverageMs < horizonMs) {
    missing.push(`finance.commitments_reviewed_through >= ${horizon.toISOString().slice(0, 10)}`);
  }

  const inflowNodes = userContextNodesForKey(active, "finance.expected_inflow", {
    asOf: asOfDate,
    minConfidence: 0.8,
    prefix: true,
  }).filter((node) => datedWithinHorizon(node, asOfMs, horizonMs));

  const commitmentNodes = userContextNodesForKey(active, "finance.commitment", {
    asOf: asOfDate,
    minConfidence: 0.8,
    prefix: true,
  }).filter((node) => datedWithinHorizon(node, asOfMs, horizonMs));

  const unpricedCommitments = commitmentNodes.filter((node) => (
    money(node.value.amount) !== null && currencyOf(node) !== normalizedCurrency
  ));
  if (unpricedCommitments.length) {
    const currencies = [...new Set(unpricedCommitments.map((node) => currencyOf(node) || "UNKNOWN"))].join(", ");
    missing.push(`currency conversion for commitments in ${currencies}`);
  }

  // Unknown-date commitments are included conservatively; unknown-date inflows
  // are excluded because optimistic cash assumptions should never inflate spend.
  const expectedInflows = Number(inflowNodes.reduce((sum, node) => {
    if (!node.value.date) return sum;
    return sum + (amountOf(node, normalizedCurrency) ?? 0);
  }, 0).toFixed(2));

  const commitments = Number(commitmentNodes.reduce(
    (sum, node) => sum + (amountOf(node, normalizedCurrency) ?? 0),
    0,
  ).toFixed(2));

  const consideredNodeIds = [
    ...(liquidNode ? [liquidNode.id] : []),
    ...(reserveNode ? [reserveNode.id] : []),
    ...(commitmentCoverageNode ? [commitmentCoverageNode.id] : []),
    ...inflowNodes.filter((node) => amountOf(node, normalizedCurrency) !== null).map((node) => node.id),
    ...commitmentNodes.filter((node) => amountOf(node, normalizedCurrency) !== null).map((node) => node.id),
    ...unpricedCommitments.map((node) => node.id),
  ];

  if (missing.length) {
    return {
      verdict: "insufficient_data",
      currency: normalizedCurrency,
      proposedCost: cost,
      safeSpend: null,
      headroom: null,
      liquidCash,
      expectedInflows,
      commitments,
      minimumReserve,
      horizonEnd: horizon.toISOString(),
      consideredNodeIds: [...new Set(consideredNodeIds)],
      missing,
      reasons: [
        "Quantora is missing one or more required financial guardrails or coverage checks.",
        "It will not assume unrecorded commitments are zero, or substitute portfolio value, market performance, inferred income, or an assumed FX rate for spendable cash.",
      ],
    };
  }

  const safeSpend = Number(Math.max(0, liquidCash + expectedInflows - commitments - minimumReserve).toFixed(2));
  const headroom = Number((safeSpend - cost).toFixed(2));

  let verdict: AffordabilityVerdict;
  if (cost > safeSpend) verdict = "not_affordable";
  else if (safeSpend === 0 || cost > safeSpend * 0.75) verdict = "possible_but_tight";
  else verdict = "comfortable";

  const reasons = [
    `Liquid cash: ${normalizedCurrency} ${liquidCash.toFixed(2)}.`,
    `Known inflows through ${horizon.toISOString().slice(0, 10)}: ${normalizedCurrency} ${expectedInflows.toFixed(2)}.`,
    `Known commitments through ${horizon.toISOString().slice(0, 10)}: ${normalizedCurrency} ${commitments.toFixed(2)}.`,
    `Commitments reviewed through: ${commitmentCoverageNode!.value.date!.slice(0, 10)}.`,
    `Protected reserve: ${normalizedCurrency} ${minimumReserve.toFixed(2)}.`,
    `Safe discretionary spend before this purchase: ${normalizedCurrency} ${safeSpend.toFixed(2)}.`,
  ];

  return {
    verdict,
    currency: normalizedCurrency,
    proposedCost: cost,
    safeSpend,
    headroom,
    liquidCash,
    expectedInflows,
    commitments,
    minimumReserve,
    horizonEnd: horizon.toISOString(),
    consideredNodeIds: [...new Set(consideredNodeIds)],
    missing: [],
    reasons,
  };
}

export function formatAffordabilityDecisionForPrompt(decision: AffordabilityDecision): string {
  if (decision.verdict === "insufficient_data") {
    return `\n\nAFFORDABILITY DECISION (deterministic; do not override with model intuition)\n- Verdict: insufficient data\n- Missing: ${decision.missing.join(", ") || "required financial inputs"}\n- Rule: ask only for the missing material input(s); do not invent affordability.`;
  }

  return `\n\nAFFORDABILITY DECISION (deterministic; do not override with model intuition)\n` +
    `- Verdict: ${decision.verdict}\n` +
    `- Proposed cost: ${decision.currency} ${decision.proposedCost.toFixed(2)}\n` +
    `- Safe discretionary spend: ${decision.currency} ${decision.safeSpend!.toFixed(2)}\n` +
    `- Headroom after proposal: ${decision.currency} ${decision.headroom!.toFixed(2)}\n` +
    `- Horizon end: ${decision.horizonEnd.slice(0, 10)}\n` +
    `Explain the answer using the underlying cash, commitments and reserve. Never present portfolio value or market gains as spendable cash unless they are explicitly represented as liquid cash.`;
}
