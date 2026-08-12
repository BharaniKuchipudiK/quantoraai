export type SessionContext = {
  goal?: string;
  facts?: string[];
  understanding?: string;
};

const MAX_FACTS = 16;
const MAX_FIELD_LEN = 280;

export function emptySessionContext(): SessionContext {
  return {};
}

export function normalizeSessionContext(value: unknown): SessionContext {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const facts = Array.isArray(v.facts)
    ? v.facts
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim().slice(0, MAX_FIELD_LEN))
        .slice(0, MAX_FACTS)
    : undefined;
  const goal = typeof v.goal === "string" ? v.goal.trim().slice(0, MAX_FIELD_LEN) : undefined;
  const understanding =
    typeof v.understanding === "string"
      ? v.understanding.trim().slice(0, MAX_FIELD_LEN * 2)
      : undefined;

  return {
    ...(goal ? { goal } : {}),
    ...(facts?.length ? { facts } : {}),
    ...(understanding ? { understanding } : {}),
  };
}

export function mergeSessionContext(existing: SessionContext, update: SessionContext): SessionContext {
  const base = normalizeSessionContext(existing);
  const next = normalizeSessionContext(update);
  const factSet = new Set([...(base.facts || []), ...(next.facts || [])]);
  return normalizeSessionContext({
    goal: next.goal || base.goal,
    understanding: next.understanding || base.understanding,
    facts: [...factSet].slice(-MAX_FACTS),
  });
}

export function formatSessionContextForPrompt(ctx: SessionContext | undefined): string {
  const normalized = normalizeSessionContext(ctx);
  if (!normalized.goal && !normalized.understanding && !normalized.facts?.length) {
    return "";
  }

  const lines = [
    "SESSION MEMORY (continuity from earlier turns — treat as ground truth; never re-ask unless the user contradicts):",
  ];
  if (normalized.goal) lines.push(`- Goal: ${normalized.goal}`);
  if (normalized.understanding) lines.push(`- Current understanding: ${normalized.understanding}`);
  if (normalized.facts?.length) {
    lines.push("- Established facts:");
    for (const fact of normalized.facts) lines.push(`  • ${fact}`);
  }
  return `\n\n${lines.join("\n")}`;
}

const CTX_MARKER = /<!--\s*quantora-ctx:\s*(\{[\s\S]*?\})\s*-->/i;
const PARTIAL_MARKER = /<!--\s*quantora-ctx:[\s\S]*$/i;

export function stripPartialContextMarker(text: string): string {
  const idx = text.search(/<!--\s*quantora-ctx:/i);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd();
}

export function extractContextFromAssistantText(text: string): {
  displayText: string;
  contextUpdate: SessionContext | null;
} {
  const match = text.match(CTX_MARKER);
  if (!match) {
    return { displayText: stripPartialContextMarker(text), contextUpdate: null };
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { displayText: text.replace(CTX_MARKER, "").trimEnd(), contextUpdate: null };
  }

  return {
    displayText: text.replace(CTX_MARKER, "").trimEnd(),
    contextUpdate: normalizeSessionContext(parsed),
  };
}

/** When the assistant asked a clarifying question, record the user's reply as a fact immediately. */
export function captureUserAnswerAsContext(userText: string, messages: Array<{ sender?: string; text?: string; choiceSet?: unknown; choiceUsed?: boolean }> | undefined): string | null {
  const trimmed = userText.trim();
  if (!trimmed || trimmed.length > MAX_FIELD_LEN) return null;

  const recentAi = [...(messages || [])]
    .reverse()
    .find((m) => m?.sender === "ai" && (m.text || m.choiceSet));
  if (!recentAi) return null;

  const aiText = typeof recentAi.text === "string" ? recentAi.text : "";
  const hadPendingChoices = Boolean(recentAi.choiceSet && !recentAi.choiceUsed);
  const aiAskedQuestion = hadPendingChoices || /\?/.test(aiText.slice(-600));

  if (!aiAskedQuestion) return null;
  return trimmed;
}
