export type ContinueItem = {
  id: string;
  label: string;
  value: string;
};

export type ContinueSet = {
  prompt?: string;
  items: ContinueItem[];
};

const MAX_ITEMS = 3;
const MAX_LABEL_LEN = 48;
const MAX_VALUE_LEN = 280;

export function normalizeContinueSet(value: unknown): ContinueSet | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const rawItems = Array.isArray(v.items) ? v.items : [];
  const items: ContinueItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim().slice(0, 24) : "";
    const label = typeof row.label === "string" ? row.label.trim().slice(0, MAX_LABEL_LEN) : "";
    const val = typeof row.value === "string" ? row.value.trim().slice(0, MAX_VALUE_LEN) : "";
    if (!id || !label || !val) continue;
    items.push({ id, label, value: val });
    if (items.length >= MAX_ITEMS) break;
  }

  if (!items.length) return null;

  const prompt = typeof v.prompt === "string" ? v.prompt.trim().slice(0, 80) : undefined;
  return { ...(prompt ? { prompt } : {}), items };
}

export const CONTINUES_MARKER = /<!--\s*quantora-continues:\s*(\{[\s\S]*?\})\s*-->/i;
export const PARTIAL_CONTINUES = /<!--\s*quantora-continues:[\s\S]*$/i;

export const CONTINUE_DIRECTIVE = `CONTINUATION CHIPS (peer conversation — every mode)
When your visible reply is complete and you are NOT ending with quantora-choices or a single blocking question, append 2–3 tappable next-beat suggestions as an HTML comment (after visible text, before quantora-ctx):
<!-- quantora-continues:{"prompt":"Where next?","items":[{"id":"c1","label":"Short chip","value":"Natural follow-up message if tapped"}]} -->
Rules:
- Feel like a thoughtful peer nudging the thread forward — not a survey, not "Let me know if you need anything else."
- Mode-aware: Travel → deepen dates/budget/day-plan; Build → refine a section, add a feature, or preview; Ask → compare, go deeper, or take the next action.
- Labels: conversational, under 6 words; values: full natural user messages.
- Max 3 items. Skip when output is pure code/HTML, PLAN JSON only, or you used quantora-choices.`;
