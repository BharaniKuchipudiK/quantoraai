/*
 * Quantora Capacity Control Plane — Phase 0 (shadow only).
 *
 * This module deliberately does NOT enforce a quota. It creates a deterministic,
 * model-agnostic work envelope at the earliest common ingress point so Quantora
 * can measure real traffic before it prices or blocks anything.
 *
 * Why start here:
 *   1. Tokens are a provider billing primitive, not a product entitlement.
 *   2. A 2k-token CSS edit and a 2k-token agentic build do not have the same
 *      infrastructure cost (tool calls, retries, sandbox time, verification).
 *   3. The admission system needs a stable contract BEFORE we add a durable
 *      reservation ledger, rolling windows, tiers, queues, or graceful degrade.
 *
 * Phase 1 will consume this envelope in an atomic reserve -> execute -> settle
 * lifecycle. Until then every existing request behaves exactly as it does today.
 */

export const CAPACITY_POLICY_VERSION = "qcu-shadow-v1";

export type CapacityTaskClass = "light" | "standard" | "build" | "deep";
export type CapacityRequestedMode = "light" | "build" | "deep";

export type CapacityRequestEnvelope = {
  /** Version the estimator so historical telemetry remains explainable. */
  policyVersion: typeof CAPACITY_POLICY_VERSION;
  taskClass: CapacityTaskClass;
  requestedMode: CapacityRequestedMode;
  /** Heavy work is what a future concurrency gate will serialize/queue. */
  heavy: boolean;
  /** Internal relative compute estimate. Never present this as provider tokens. */
  estimatedQcu: number;
  /** Coarse input-context estimate; the routed model decides the real window. */
  estimatedContextTokens: number;
  /** Machine-readable explanations only — never prompt text. */
  reasons: string[];
};

export type CapacityEstimateInput = {
  message: string;
  history?: unknown;
  taskCategory?: string | null;
  studioMode?: string | null;
  buildMode?: boolean;
  cognitiveLevel?: string | null;
  attachedImageCount?: number;
  hasPreviewCode?: boolean;
  isRefine?: boolean;
};

const MAX_HISTORY_ITEMS = 100;
const MAX_QCU_ESTIMATE = 100;

function textLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (!value || typeof value !== "object") return 0;
  const row = value as Record<string, unknown>;
  for (const key of ["text", "content", "message"]) {
    if (typeof row[key] === "string") return (row[key] as string).length;
  }
  return 0;
}

function historyCharacters(history: unknown): number {
  if (!Array.isArray(history)) return 0;
  return history.slice(-MAX_HISTORY_ITEMS).reduce((sum, item) => sum + textLength(item), 0);
}

function clampFinite(value: unknown, minimum: number, maximum: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Cheap tokenizer-independent approximation used only for admission planning.
 * It intentionally errs slightly high: underestimating context is more harmful
 * than reserving a small amount of extra capacity. Provider-reported usage will
 * become the settlement source of truth in a later phase.
 */
function estimatedContextTokens(input: CapacityEstimateInput): number {
  const messageChars = typeof input.message === "string" ? input.message.length : 0;
  const historyChars = historyCharacters(input.history);
  const imageCount = clampFinite(input.attachedImageCount, 0, 4);
  const previewOverhead = input.hasPreviewCode ? 1_500 : 0;

  // ~4 chars/token is deliberately simple and provider-neutral. Images get a
  // conservative planning allowance; the exact multimodal token bill varies.
  return Math.max(1, Math.ceil((messageChars + historyChars) / 4) + (imageCount * 1_000) + previewOverhead);
}

function classifyTask(input: CapacityEstimateInput, contextTokens: number): {
  taskClass: CapacityTaskClass;
  requestedMode: CapacityRequestedMode;
  reasons: string[];
} {
  const reasons: string[] = [];
  const category = String(input.taskCategory || "").trim().toLowerCase();
  const cognitive = String(input.cognitiveLevel || "").trim().toLowerCase();
  const studioMode = String(input.studioMode || "").trim().toLowerCase();
  const deep = cognitive.includes("deep") || cognitive.includes("reason") || studioMode === "plan";
  const build = input.buildMode === true || category === "coding";

  if (deep) reasons.push("deep_reasoning");
  if (build) reasons.push("build_intent");
  if (input.isRefine) reasons.push("refine_turn");
  if ((input.attachedImageCount || 0) > 0) reasons.push("image_input");
  if (contextTokens >= 32_000) reasons.push("large_context");

  if (deep) return { taskClass: "deep", requestedMode: "deep", reasons };
  if (build) return { taskClass: "build", requestedMode: "build", reasons };

  const quick = category === "quick"
    && contextTokens < 4_000
    && (input.attachedImageCount || 0) === 0;
  if (quick) {
    reasons.push("quick_turn");
    return { taskClass: "light", requestedMode: "light", reasons };
  }

  reasons.push("standard_turn");
  return { taskClass: "standard", requestedMode: "light", reasons };
}

/**
 * Produce the immutable admission envelope for one incoming turn.
 *
 * QCU is intentionally RELATIVE in Phase 0. We calibrate these weights against
 * real provider tokens, latency, retries, tool/sandbox work and completion rate
 * before any user-facing allowance is switched on.
 */
export function estimateCapacityRequest(input: CapacityEstimateInput): CapacityRequestEnvelope {
  const contextTokens = estimatedContextTokens(input);
  const classification = classifyTask(input, contextTokens);
  const imageCount = clampFinite(input.attachedImageCount, 0, 4);

  const baseQcu: Record<CapacityTaskClass, number> = {
    light: 1,
    standard: 3,
    build: 12,
    deep: 18,
  };

  // Context has a sub-linear multiplier. Long conversations should cost more,
  // but not explode merely because the user has useful project continuity.
  const contextMultiplier = 1 + Math.min(1.5, contextTokens / 64_000);
  const imageQcu = imageCount * 1.5;
  const refineQcu = input.isRefine ? 2 : 0;
  const previewQcu = input.hasPreviewCode ? 1 : 0;

  const estimatedQcu = roundTenth(Math.min(
    MAX_QCU_ESTIMATE,
    (baseQcu[classification.taskClass] * contextMultiplier) + imageQcu + refineQcu + previewQcu,
  ));

  const heavy = classification.taskClass === "build"
    || classification.taskClass === "deep"
    || contextTokens >= 32_000;

  return {
    policyVersion: CAPACITY_POLICY_VERSION,
    taskClass: classification.taskClass,
    requestedMode: classification.requestedMode,
    heavy,
    estimatedQcu,
    estimatedContextTokens: contextTokens,
    reasons: classification.reasons,
  };
}
