/*
 * Chip-based feedback composes into the EXISTING /api/pipeline contract:
 * one message string (≤500 chars) and a feedbackType of 'feedback' or
 * 'suggestion'. Chips fold into the message text — no schema change, and the
 * admin feedback panel reads the result with no new parsing.
 */

export const FEEDBACK_MESSAGE_LIMIT = 500;

/** Chips that read as "what Quantora should do next" file as suggestions. */
const SUGGESTION_CHIPS = new Set(['Missing a capability', 'Feature idea']);

export function composeFeedbackMessage(selectedChips, detail) {
  const chips = (selectedChips || []).join(' · ');
  const text = String(detail || '').trim();
  const message = chips && text ? `${chips} — ${text}` : (chips || text);
  return message.slice(0, FEEDBACK_MESSAGE_LIMIT);
}

export function deriveFeedbackType(selectedChips) {
  return (selectedChips || []).some((chip) => SUGGESTION_CHIPS.has(chip)) ? 'suggestion' : 'feedback';
}
