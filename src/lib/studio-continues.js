const MAX_ITEMS = 3;
const MAX_LABEL_LEN = 48;
const MAX_VALUE_LEN = 280;
const MAX_PROMPT_LEN = 80;

export const CONTINUES_MARKER = /<!--\s*quantora-continues:\s*(\{[\s\S]*?\})\s*-->/i;
export const PARTIAL_CONTINUES = /<!--\s*quantora-continues:[\s\S]*$/i;

export function normalizeContinueSet(value) {
  if (!value || typeof value !== 'object') return null;
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim().slice(0, 24) : '';
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, MAX_LABEL_LEN) : '';
    const val = typeof item.value === 'string' ? item.value.trim().slice(0, MAX_VALUE_LEN) : '';
    if (!id || !label || !val) continue;
    items.push({ id, label, value: val });
    if (items.length >= MAX_ITEMS) break;
  }

  if (!items.length) return null;

  const prompt = typeof value.prompt === 'string' ? value.prompt.trim().slice(0, MAX_PROMPT_LEN) : undefined;
  return { ...(prompt ? { prompt } : {}), items };
}

export function extractContinuesFromAssistantText(text) {
  const match = text.match(CONTINUES_MARKER);
  if (!match) {
    return { displayText: text, continueSet: null };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return {
      displayText: text.replace(CONTINUES_MARKER, '').trimEnd(),
      continueSet: null,
    };
  }

  return {
    displayText: text.replace(CONTINUES_MARKER, '').trimEnd(),
    continueSet: normalizeContinueSet(parsed),
  };
}
