export type StudioChoice = {
  id: string;
  label: string;
  value: string;
  description?: string;
};

export type StudioChoiceSet = {
  title?: string;
  prompt?: string;
  choices: StudioChoice[];
};

const MAX_CHOICES = 5;
const MAX_LABEL_LEN = 80;
const MAX_VALUE_LEN = 400;
const MAX_TITLE_LEN = 120;

export function normalizeStudioChoiceSet(value: unknown): StudioChoiceSet | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const rawChoices = Array.isArray(v.choices) ? v.choices : [];
  const choices: StudioChoice[] = [];

  for (const item of rawChoices) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id.trim().slice(0, 40) : "";
    const label = typeof c.label === "string" ? c.label.trim().slice(0, MAX_LABEL_LEN) : "";
    const val = typeof c.value === "string" ? c.value.trim().slice(0, MAX_VALUE_LEN) : "";
    const description = typeof c.description === "string"
      ? c.description.trim().slice(0, MAX_LABEL_LEN)
      : undefined;
    if (!id || !label || !val) continue;
    choices.push({ id, label, value: val, ...(description ? { description } : {}) });
    if (choices.length >= MAX_CHOICES) break;
  }

  if (!choices.length) return null;

  const title = typeof v.title === "string" ? v.title.trim().slice(0, MAX_TITLE_LEN) : undefined;
  const prompt = typeof v.prompt === "string" ? v.prompt.trim().slice(0, MAX_TITLE_LEN) : undefined;

  return {
    ...(title ? { title } : {}),
    ...(prompt ? { prompt } : {}),
    choices,
  };
}

const CHOICES_MARKER = /<!--\s*quantora-choices:\s*(\{[\s\S]*?\})\s*-->/i;
const PARTIAL_CHOICES = /<!--\s*quantora-choices:[\s\S]*$/i;
const PARTIAL_CONTINUES = /<!--\s*quantora-continues:[\s\S]*$/i;
const PARTIAL_CTX = /<!--\s*quantora-ctx:[\s\S]*$/i;

/** Hide incomplete markers during SSE streaming. */
export function stripPartialAssistantMarkers(text: string): string {
  let out = text;
  for (const re of [PARTIAL_CHOICES, PARTIAL_CONTINUES, PARTIAL_CTX]) {
    const idx = out.search(re);
    if (idx !== -1) out = out.slice(0, idx).trimEnd();
  }
  return out;
}

export function extractChoicesFromAssistantText(text: string): {
  displayText: string;
  choiceSet: StudioChoiceSet | null;
} {
  const match = text.match(CHOICES_MARKER);
  if (!match) {
    return { displayText: stripPartialAssistantMarkers(text), choiceSet: null };
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return {
      displayText: text.replace(CHOICES_MARKER, "").trimEnd(),
      choiceSet: null,
    };
  }

  return {
    displayText: text.replace(CHOICES_MARKER, "").trimEnd(),
    choiceSet: normalizeStudioChoiceSet(parsed),
  };
}

/** Full parse: choices marker first, then session context marker. */
export function parseAssistantMarkers(text: string): {
  displayText: string;
  choiceSet: StudioChoiceSet | null;
} {
  const { displayText: afterChoices, choiceSet } = extractChoicesFromAssistantText(text);
  return { displayText: afterChoices, choiceSet };
}

export const CHOICES_DIRECTIVE = `STRUCTURED FOLLOW-UP OPTIONS
When you need the user to pick among 2–5 concrete options (guided build intake, travel dates/budget, site type, payment preference, strategic framework, etc.), keep your visible reply to one short natural question, then append this XML block as the last line:
<quantora-modal>
{"question":"Short heading (e.g. 'What should I do here?')","options":[{"id":"unique_id","title":"Button label","description":"Optional subtitle explaining the choice"}]}
</quantora-modal>
Rules:
- Use ONLY when options are genuinely discrete; never for open-ended questions.
- Max 5 choices; the title of the selected choice is the precise next message the user would send.
- Omit the modal if a free-text answer is better.
- Do not repeat the same options in prose and in the JSON.`;
