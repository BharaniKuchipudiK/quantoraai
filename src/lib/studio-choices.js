const MAX_CHOICES = 5;
const MAX_LABEL_LEN = 80;
const MAX_VALUE_LEN = 400;
const MAX_TITLE_LEN = 120;

const CHOICES_MARKER = /<!--\s*quantora-choices:\s*(\{[\s\S]*?\})\s*-->/i;
const PARTIAL_CHOICES = /<!--\s*quantora-choices:[\s\S]*$/i;
const PARTIAL_CTX = /<!--\s*quantora-ctx:[\s\S]*$/i;

export function normalizeStudioChoiceSet(value) {
  if (!value || typeof value !== 'object') return null;
  const rawChoices = Array.isArray(value.choices) ? value.choices : [];
  const choices = [];

  for (const item of rawChoices) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim().slice(0, 40) : '';
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, MAX_LABEL_LEN) : '';
    const val = typeof item.value === 'string' ? item.value.trim().slice(0, MAX_VALUE_LEN) : '';
    const description = typeof item.description === 'string'
      ? item.description.trim().slice(0, MAX_LABEL_LEN)
      : undefined;
    if (!id || !label || !val) continue;
    choices.push({ id, label, value: val, ...(description ? { description } : {}) });
    if (choices.length >= MAX_CHOICES) break;
  }

  if (!choices.length) return null;

  const title = typeof value.title === 'string' ? value.title.trim().slice(0, MAX_TITLE_LEN) : undefined;
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim().slice(0, MAX_TITLE_LEN) : undefined;

  return {
    ...(title ? { title } : {}),
    ...(prompt ? { prompt } : {}),
    choices,
  };
}

export function stripPartialAssistantMarkers(text) {
  let out = text;
  for (const re of [PARTIAL_CHOICES, PARTIAL_CTX]) {
    const idx = out.search(re);
    if (idx !== -1) out = out.slice(0, idx).trimEnd();
  }
  return out;
}

export function extractChoicesFromAssistantText(text) {
  const match = text.match(CHOICES_MARKER);
  if (!match) {
    return { displayText: stripPartialAssistantMarkers(text), choiceSet: null };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return {
      displayText: text.replace(CHOICES_MARKER, '').trimEnd(),
      choiceSet: null,
    };
  }

  return {
    displayText: text.replace(CHOICES_MARKER, '').trimEnd(),
    choiceSet: normalizeStudioChoiceSet(parsed),
  };
}

export function parseAssistantResponse(text) {
  const { displayText: afterChoices, choiceSet } = extractChoicesFromAssistantText(text);
  return { displayText: afterChoices, choiceSet };
}
