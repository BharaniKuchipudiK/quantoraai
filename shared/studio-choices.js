/*
 * Assistant choice markers — the ONE implementation for both sides of the
 * wire. src/lib/studio-choices.js and api/_lib/studio-choices.ts are shims
 * over this module (the api shim also carries the TypeScript types). The two
 * sides once parsed the same markers with independently-evolved parsers.
 */

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

/** Server-historical name for the same parse; keep both until call sites converge. */
export const parseAssistantMarkers = parseAssistantResponse;

/**
 * A trip-length (or any) decision card is a question, not a souvenir.
 * After the learner/traveller answers, it must not stay in the thread.
 */
export function shouldShowAssistantDecisionCard({
  choiceUsed = false,
  messageId = null,
  messages = [],
} = {}) {
  if (choiceUsed) return false;
  const index = (messages || []).findIndex((message) => message?.id === messageId);
  if (index < 0) return true;
  return !(messages || []).slice(index + 1).some((message) => (
    message?.sender === 'user' && String(message.text || '').trim()
  ));
}

/*
 * The first-turn carve-out, named so a gate can assert it without matching prose.
 *
 * GUIDED_BUILD_DIRECTIVE says the opening build turn MUST append a modal. The
 * rules below say to omit it for open-ended questions. Both reached the model in
 * ONE prompt, and on 2026-09-04 it resolved them the only way it could — it
 * judged "sell online or showcase?" open-ended, asked in prose, and the blocking
 * deployed golden failed the turn for having no modal. The platform punished the
 * model for obeying it, the same shape as the intake modal discarded over a
 * newline and the image url wrapped twice.
 *
 * Appended by conversation-policy ONLY when guided intake is active — never
 * folded into CHOICES_DIRECTIVE, which also ships in build mode, where the
 * FIRST-TURN RULE must not appear at all (it forbids the HTML build mode
 * exists to produce). conversation-policy.test.ts holds that line.
 *
 * Reword this freely; intake-modal-contract.test.ts asserts the CONSTANT is in
 * the assembled prompt wherever the omission rules are, never these words (§6).
 */
export const FIRST_TURN_MODAL_EXEMPTION = `GUIDED BUILD, FIRST TURN — the two escape hatches above do not apply.
The FIRST-TURN RULE governs there and the modal is REQUIRED. That turn's question
is always a direction the user picks between, never an essay: "sell online, or a
showcase?", "brochure, shop, or portfolio?", "dine-in, takeaway, or both?". Offer
those as options. Judging it open-ended and asking in prose leaves the user typing
an answer the desk could have handed them, and is the one case where omitting the
modal is wrong.`;

/**
 * The escape hatches the exemption above must always accompany — the SOURCE of
 * those two lines, not a copy of them. A copy would let the directive be
 * reworded while the gate went on matching text no prompt contains any more,
 * which is a gate that cannot fail (§4). Composed into CHOICES_DIRECTIVE below.
 */
export const MODAL_OMISSION_RULES = [
  'Use ONLY when options are genuinely discrete; never for open-ended questions.',
  'Omit the modal if a free-text answer is better.',
];

export const CHOICES_DIRECTIVE = `STRUCTURED FOLLOW-UP OPTIONS
When you need the user to pick among 2–5 concrete options (guided build intake, travel dates/budget, site type, payment preference, strategic framework, etc.), keep your visible reply to one short natural question, then append this XML block as the last line:
<quantora-modal>
{"question":"Short heading (e.g. 'What should I do here?')","options":[{"id":"unique_id","title":"Button label","description":"Optional subtitle explaining the choice"}]}
</quantora-modal>
Rules:
- ${MODAL_OMISSION_RULES[0]}
- Max 5 choices; the title of the selected choice is the precise next message the user would send.
- ${MODAL_OMISSION_RULES[1]}
- Do not repeat the same options in prose and in the JSON.`;
