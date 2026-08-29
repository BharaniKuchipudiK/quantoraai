export const USER_CONTEXT_CATEGORIES = [
  "fact",
  "preference",
  "goal",
  "commitment",
  "constraint",
  "financial_state",
] as const;

export type UserContextCategory = (typeof USER_CONTEXT_CATEGORIES)[number];
export type UserContextProvenance = "user" | "connected_source" | "tool" | "inferred" | "system";
export type UserContextStatus = "active" | "superseded";

export type UserContextValue = {
  text?: string;
  amount?: number;
  currency?: string;
  number?: number;
  boolean?: boolean;
  date?: string;
};

export type UserContextNode = {
  id: string;
  category: UserContextCategory;
  key: string;
  value: UserContextValue;
  provenance: UserContextProvenance;
  confidence: number;
  status: UserContextStatus;
  sourceRef?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  updatedAt?: string | null;
};

const MAX_NODES = 240;
const MAX_ID = 128;
const MAX_KEY = 160;
const MAX_TEXT = 800;
const MAX_SOURCE_REF = 2_000;

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, max);
  return normalized || undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function confidence(value: unknown): number {
  const numeric = finiteNumber(value);
  if (numeric === undefined) return 0.5;
  return Number(Math.max(0, Math.min(1, numeric)).toFixed(3));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function timestamp(value: unknown): string | null {
  const text = cleanText(value, 80);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeValue(value: unknown): UserContextValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const normalized: UserContextValue = {};

  const text = cleanText(raw.text, MAX_TEXT);
  if (text) normalized.text = text;

  const amount = finiteNumber(raw.amount);
  if (amount !== undefined) normalized.amount = Number(amount.toFixed(2));

  const currency = cleanText(raw.currency, 12)?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) normalized.currency = currency;

  const number = finiteNumber(raw.number);
  if (number !== undefined) normalized.number = number;

  if (typeof raw.boolean === "boolean") normalized.boolean = raw.boolean;

  const date = timestamp(raw.date);
  if (date) normalized.date = date;

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeNode(value: unknown): UserContextNode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const id = cleanText(raw.id, MAX_ID);
  const key = cleanText(raw.key ?? raw.context_key, MAX_KEY)?.toLowerCase();
  const normalizedValue = normalizeValue(raw.value);
  if (!id || !key || !normalizedValue || !/^[a-z0-9][a-z0-9._:-]*$/.test(key)) return null;

  const category = enumValue(raw.category, USER_CONTEXT_CATEGORIES, "fact");
  const provenance = enumValue(
    raw.provenance,
    ["user", "connected_source", "tool", "inferred", "system"] as const,
    "inferred",
  );
  const status = enumValue(raw.status, ["active", "superseded"] as const, "active");

  return {
    id,
    category,
    key,
    value: normalizedValue,
    provenance,
    confidence: confidence(raw.confidence),
    status,
    sourceRef: cleanText(raw.sourceRef ?? raw.source_ref, MAX_SOURCE_REF) || null,
    validFrom: timestamp(raw.validFrom ?? raw.valid_from),
    validUntil: timestamp(raw.validUntil ?? raw.valid_until),
    updatedAt: timestamp(raw.updatedAt ?? raw.updated_at),
  };
}

/**
 * Normalize account-level context without retaining chat transcripts. Every node
 * must have explicit provenance and confidence so inferred data never silently
 * becomes a trusted user fact.
 */
export function normalizeUserContextGraph(value: unknown): UserContextNode[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, UserContextNode>();
  for (const candidate of value.slice(-MAX_NODES * 2)) {
    const node = normalizeNode(candidate);
    if (!node) continue;
    byId.set(node.id, node);
  }
  return [...byId.values()].slice(-MAX_NODES);
}

export function activeUserContextNodes(
  graph: UserContextNode[] | unknown,
  options: { asOf?: string | Date; minConfidence?: number; categories?: UserContextCategory[] } = {},
): UserContextNode[] {
  const asOf = options.asOf instanceof Date
    ? options.asOf
    : new Date(options.asOf || Date.now());
  const asOfMs = asOf.getTime();
  const minConfidence = Math.max(0, Math.min(1, options.minConfidence ?? 0.8));
  const categories = options.categories?.length ? new Set(options.categories) : null;

  return normalizeUserContextGraph(graph).filter((node) => {
    if (node.status !== "active" || node.confidence < minConfidence) return false;
    if (categories && !categories.has(node.category)) return false;
    if (node.validFrom && Date.parse(node.validFrom) > asOfMs) return false;
    if (node.validUntil && Date.parse(node.validUntil) < asOfMs) return false;
    return true;
  });
}

export function userContextNodesForKey(
  graph: UserContextNode[] | unknown,
  key: string,
  options: { asOf?: string | Date; minConfidence?: number; prefix?: boolean } = {},
): UserContextNode[] {
  const normalizedKey = key.trim().toLowerCase();
  return activeUserContextNodes(graph, options).filter((node) => (
    options.prefix
      ? node.key === normalizedKey || node.key.startsWith(`${normalizedKey}.`)
      : node.key === normalizedKey
  ));
}

function displayValue(value: UserContextValue): string {
  if (typeof value.amount === "number") return `${value.currency || ""} ${value.amount.toFixed(2)}`.trim();
  if (typeof value.number === "number") return String(value.number);
  if (typeof value.boolean === "boolean") return String(value.boolean);
  if (value.date) return value.date;
  return value.text || "";
}

