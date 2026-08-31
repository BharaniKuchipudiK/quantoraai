/*
 * Continuation chips — the ONE implementation for both sides of the wire.
 * src/lib/studio-continues.js and api/_lib/studio-continues.ts are shims over
 * this module (the api shim also carries the TypeScript types). The producer
 * (server directive) and consumer (client extractor) halves once lived apart.
 */

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

export const CONTINUE_DIRECTIVE = `CONTINUATION CHIPS (peer conversation — every mode)
When your visible reply is complete and you are NOT ending with quantora-choices or a single blocking question, append 2–3 tappable next-beat suggestions as an HTML comment (after visible text, before quantora-ctx):
<!-- quantora-continues:{"prompt":"Where next?","items":[{"id":"c1","label":"Short chip","value":"Natural follow-up message if tapped"}]} -->
Rules:
- Feel like a thoughtful peer nudging the thread forward — not a survey, not "Let me know if you need anything else."
- Mode-aware: Travel → deepen dates/budget/day-plan; Build → refine a section, add a feature, or preview; Ask → compare, go deeper, or take the next action.
- Labels: conversational, under 6 words; values: full natural user messages.
- Max 3 items. Skip only when the reply is a code/HTML block with no conversational explanation. If BUILD chat text exists, still emit chips (payments, shipping, publish for shops).
- If session memory has Outcome kind powerpoint, word, or excel: chips must be about that file (audience, slides, evidence, speaker notes, download). Never offer Vercel, custom domains, cart, payments, or shipping.`;

const DOMAIN_CONTINUE_HINTS = {
  travel: `Travel anticipation beats (pick what is still missing): Pin down dates · Set a budget · Who is traveling · Day-by-day itinerary · Build trip page (Build mode).`,
  finance: `Finance anticipation beats: Clarify goal · Rough numbers · Time horizon · Simple action plan · Build tracker (Build mode).`,
  research: `Research anticipation beats: Narrow scope · Compare options · Audience · Executive summary · Research page (Build mode).`,
  education: `Education anticipation beats: Stay at the stored syllabus depth · Empathize if they struggled · One next action from their gap list · Never invent a chapter. Do not offer a website or learning app.`,
};

export function buildDomainContinueHint(domain) {
  if (!domain || !DOMAIN_CONTINUE_HINTS[domain]) return '';
  return `\n\nDOMAIN CONTINUE HINT (${domain}): ${DOMAIN_CONTINUE_HINTS[domain]}`;
}
