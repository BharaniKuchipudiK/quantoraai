const MAX_CHOICES = 5;
const MAX_LABEL_LEN = 80;
const MAX_VALUE_LEN = 400;
const MAX_TITLE_LEN = 120;

const CHOICES_MARKER = /<!--\s*quantora-choices:\s*(\{[\s\S]*?\})\s*-->/i;
const PARTIAL_PROTOCOL_START = /<!--\s*quantora-(?:choices|continues|ctx):/ig;

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

/**
 * Streaming providers occasionally leave a machine-readable marker incomplete.
 * Hide that marker, but never throw away later user-visible prose. Quantora's
 * protocol requires metadata comments to occupy their own line, so a malformed
 * marker is removed line-by-line rather than truncating the entire response.
 */
export function stripPartialAssistantMarkers(text) {
  let out = typeof text === 'string' ? text : '';
  PARTIAL_PROTOCOL_START.lastIndex = 0;

  while (true) {
    const match = PARTIAL_PROTOCOL_START.exec(out);
    if (!match || match.index == null) break;

    const start = match.index;
    const close = out.indexOf('-->', start);
    if (close !== -1) {
      PARTIAL_PROTOCOL_START.lastIndex = close + 3;
      continue;
    }

    const lineEnd = out.indexOf('\n', start);
    if (lineEnd === -1) {
      out = out.slice(0, start).trimEnd();
      break;
    }

    out = `${out.slice(0, start).trimEnd()}\n${out.slice(lineEnd + 1).trimStart()}`.trim();
    PARTIAL_PROTOCOL_START.lastIndex = 0;
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
