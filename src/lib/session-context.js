const MAX_FACTS = 16;
const MAX_FIELD_LEN = 280;
const CTX_MARKER = /<!--\s*quantora-ctx:\s*(\{[\s\S]*?\})\s*-->/i;

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

export function stripPartialContextMarker(text) {
  const idx = text.search(/<!--\s*quantora-ctx:/i);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd();
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
