const MAX_FACTS = 16;
const MAX_FIELD_LEN = 280;
const CTX_MARKER = /<!--\s*quantora-ctx:\s*(\{[\s\S]*?\})\s*-->/i;
const CTX_START = /<!--\s*quantora-ctx:/i;

export function emptySessionContext() {
  return {};
}

export function normalizeSessionContext(value) {
  if (!value || typeof value !== 'object') return {};
  const facts = Array.isArray(value.facts)
    ? value.facts
        .filter((f) => typeof f === 'string' && f.trim().length > 0)
        .map((f) => f.trim().slice(0, MAX_FIELD_LEN))
        .slice(0, MAX_FACTS)
    : undefined;
  const goal = typeof value.goal === 'string' ? value.goal.trim().slice(0, MAX_FIELD_LEN) : undefined;
  const understanding = typeof value.understanding === 'string'
    ? value.understanding.trim().slice(0, MAX_FIELD_LEN * 2)
    : undefined;

  return {
    ...(goal ? { goal } : {}),
    ...(facts?.length ? { facts } : {}),
    ...(understanding ? { understanding } : {}),
  };
}

export function mergeSessionContext(existing, update) {
  const base = normalizeSessionContext(existing);
  const next = normalizeSessionContext(update);
  const factSet = new Set([...(base.facts || []), ...(next.facts || [])]);
  return normalizeSessionContext({
    goal: next.goal || base.goal,
    understanding: next.understanding || base.understanding,
    facts: [...factSet].slice(-MAX_FACTS),
  });
}

/**
 * Hide an incomplete machine marker without discarding visible prose that may
 * follow it. Protocol comments are required to be one-line metadata; if a
 * provider violates that contract, remove only the malformed marker line.
 */
export function stripPartialContextMarker(text) {
  const value = typeof text === 'string' ? text : '';
  const match = value.match(CTX_START);
  if (!match || match.index == null) return value;

  const start = match.index;
  const lineEnd = value.indexOf('\n', start);
  if (lineEnd === -1) return value.slice(0, start).trimEnd();

  return `${value.slice(0, start).trimEnd()}\n${value.slice(lineEnd + 1).trimStart()}`.trim();
}

export function extractContextFromAssistantText(text) {
  const match = text.match(CTX_MARKER);
  if (!match) {
    return { displayText: stripPartialContextMarker(text), contextUpdate: null };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { displayText: text.replace(CTX_MARKER, '').trimEnd(), contextUpdate: null };
  }

  return {
    displayText: text.replace(CTX_MARKER, '').trimEnd(),
    contextUpdate: normalizeSessionContext(parsed),
  };
}

export function hasSessionMemory(ctx) {
  const normalized = normalizeSessionContext(ctx);
  return Boolean(normalized.goal || normalized.understanding || normalized.facts?.length);
}

/** When the assistant asked a clarifying question, record the user's reply as a fact immediately. */
export function captureUserAnswerAsContext(userText, messages) {
  const trimmed = typeof userText === 'string' ? userText.trim() : '';
  if (!trimmed || trimmed.length > MAX_FIELD_LEN) return null;

  const recentAi = [...(messages || [])]
    .reverse()
    .find((m) => m && m.sender === 'ai' && (m.text || m.choiceSet));
  if (!recentAi) return null;

  const aiText = typeof recentAi.text === 'string' ? recentAi.text : '';
  const hadPendingChoices = Boolean(recentAi.choiceSet && !recentAi.choiceUsed);
  const aiAskedQuestion = hadPendingChoices || /\?/.test(aiText.slice(-600));

  if (!aiAskedQuestion) return null;
  return trimmed;
}
