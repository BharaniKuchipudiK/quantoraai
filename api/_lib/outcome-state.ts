const MAX_SESSION_ID = 128;
const MAX_TEXT = 500;
const MAX_ITEMS = 40;

export type OutcomeState = {
  goal?: { statement: string; status: "draft" | "confirmed" | "achieved"; sourceTurn?: string | null };
  understanding?: { statement: string; status: "inferred" | "confirmed"; sourceTurn?: string | null };
  definitionOfDone: Array<{ criterion: string; confirmed: boolean; sourceTurn?: string | null }>;
  constraints: Array<{ value: string; confidence: number; sourceTurn?: string | null }>;
  assumptions: Array<{ value: string; status: "inferred" | "confirmed" | "rejected"; sourceTurn?: string | null }>;
  openQuestions: Array<{ question: string; material: boolean; sourceTurn?: string | null }>;
  decisions: Array<{ value: string; rationale?: string; sourceTurn?: string | null }>;
  artifacts: Array<{ type: string; ref: string; verifiedAt?: string | null }>;
  nextActions: Array<{ action: string; risk: "low" | "medium" | "high" }>;
  memory: { scope: "session" | "project" | "account"; consented: boolean };
  safety: { policyVersion?: string; unresolvedFlags: string[] };
};

export type OutcomeStateRecord = {
  sessionId: string;
  version: number;
  state: OutcomeState;
  updatedAt?: string;
};

function text(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, max);
  return normalized || undefined;
}

function sourceTurn(value: unknown): string | null {
  return text(value, 128) || null;
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object").slice(0, MAX_ITEMS)
    : [];
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizeOutcomeSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sessionId = value.trim();
  return sessionId && sessionId.length <= MAX_SESSION_ID && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(sessionId)
    ? sessionId
    : null;
}

export function emptyOutcomeState(): OutcomeState {
  return {
    definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [],
    decisions: [], artifacts: [], nextActions: [],
    memory: { scope: "session", consented: false },
    safety: { unresolvedFlags: [] },
  };
}

export function normalizeOutcomeState(value: unknown): OutcomeState {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  const goalStatement = text(raw.goal?.statement);
  const understandingStatement = text(raw.understanding?.statement, 1_000);

  return {
    ...(goalStatement ? { goal: {
      statement: goalStatement,
      status: enumValue(raw.goal?.status, ["draft", "confirmed", "achieved"] as const, "draft"),
      sourceTurn: sourceTurn(raw.goal?.sourceTurn),
    } } : {}),
    ...(understandingStatement ? { understanding: {
      statement: understandingStatement,
      status: enumValue(raw.understanding?.status, ["inferred", "confirmed"] as const, "inferred"),
      sourceTurn: sourceTurn(raw.understanding?.sourceTurn),
    } } : {}),
    definitionOfDone: objects(raw.definitionOfDone).flatMap((item) => {
      const criterion = text(item.criterion);
      return criterion ? [{ criterion, confirmed: item.confirmed === true, sourceTurn: sourceTurn(item.sourceTurn) }] : [];
    }),
    constraints: objects(raw.constraints).flatMap((item) => {
      const v = text(item.value);
      const confidence = typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5;
      return v ? [{ value: v, confidence, sourceTurn: sourceTurn(item.sourceTurn) }] : [];
    }),
    assumptions: objects(raw.assumptions).flatMap((item) => {
      const v = text(item.value);
      return v ? [{
        value: v,
        status: enumValue(item.status, ["inferred", "confirmed", "rejected"] as const, "inferred"),
        sourceTurn: sourceTurn(item.sourceTurn),
      }] : [];
    }),
    openQuestions: objects(raw.openQuestions).flatMap((item) => {
      const question = text(item.question);
      return question ? [{ question, material: item.material === true, sourceTurn: sourceTurn(item.sourceTurn) }] : [];
    }),
    decisions: objects(raw.decisions).flatMap((item) => {
      const v = text(item.value);
      return v ? [{ value: v, rationale: text(item.rationale), sourceTurn: sourceTurn(item.sourceTurn) }] : [];
    }),
    artifacts: objects(raw.artifacts).flatMap((item) => {
      const type = text(item.type, 80);
      const ref = text(item.ref, 2_000);
      return type && ref ? [{ type, ref, verifiedAt: text(item.verifiedAt, 80) || null }] : [];
    }),
    nextActions: objects(raw.nextActions).flatMap((item) => {
      const action = text(item.action);
      return action ? [{ action, risk: enumValue(item.risk, ["low", "medium", "high"] as const, "low") }] : [];
    }),
    memory: {
      scope: enumValue(raw.memory?.scope, ["session", "project", "account"] as const, "session"),
      consented: raw.memory?.consented === true,
    },
    safety: {
      policyVersion: text(raw.safety?.policyVersion, 80),
      unresolvedFlags: Array.isArray(raw.safety?.unresolvedFlags)
        ? raw.safety.unresolvedFlags.flatMap((item: unknown) => text(item, 120) || []).slice(0, 20)
        : [],
    },
  };
}
