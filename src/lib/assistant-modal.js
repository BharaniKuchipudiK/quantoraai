/**
 * READING THE DECISION MODAL THE MODEL WROTE.
 *
 * WHY THIS EXISTS
 *
 * The platform asks the model to pause and ask ONE material question before
 * building something ambiguous. The model answers with prose plus a marker:
 *
 *   <quantora-modal>{ "question": "...", "options": [...] }</quantora-modal>
 *
 * AiStudio parsed that inline with a bare JSON.parse in a try/catch whose only
 * consequence was console.error. So when the parse failed:
 *
 *   - no decision modal rendered, and the turn looked dead;
 *   - `cleanText` was replaced only ON SUCCESS, so the raw JSON blob stayed in
 *     the message the USER READS;
 *   - the error went to a console nobody watches.
 *
 * On 2026-09-04 that reached production. The deployed golden's guided-intake
 * transaction failed with "neither an intake question nor an artifact within
 * 150s", and the page's own console carried the reason:
 *
 *   Failed to parse modal data SyntaxError: Bad control character in string
 *   literal in JSON at position 93 (line 2 column 93)
 *
 * The model had obeyed. It asked exactly the right question — the transcript
 * ends "...the one thing that changes the whole build: should " — and the
 * platform threw its answer away. That is the class CLAUDE.md names for the
 * guided-intake gate: a platform that punishes the model for obeying it.
 *
 * WHAT "BAD CONTROL CHARACTER" ACTUALLY MEANS
 *
 * A raw newline inside a JSON string literal. JSON forbids unescaped
 * characters below 0x20 inside strings, and a model writing a natural
 * two-line question produces one every time. This is not the model being
 * malformed in some unbounded way; it is one specific, extremely common, and
 * completely repairable deviation.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not "fix JSON" in general — no quote balancing, no trailing-comma
 * removal, no bracket completion. Each of those guesses at intent and can
 * invent an option the model never offered, which on a decision modal means
 * putting words in its mouth and then acting on the user's click. Control
 * characters inside strings are the one case where the repair is
 * information-preserving: the character was already there, only its encoding
 * was wrong.
 */

/**
 * Escape control characters that appear INSIDE string literals.
 *
 * Walks the text tracking string state so control characters BETWEEN tokens —
 * where they are ordinary, legal whitespace — are left exactly as they are.
 */
function escapeControlCharsInStrings(raw) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of String(raw)) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch < ' ') {
      out += ch === '\n' ? '\\n'
        : ch === '\r' ? '\\r'
          : ch === '\t' ? '\\t'
            : `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }
  return out;
}

const MODAL_MARKER = /<quantora-modal>([\s\S]*?)<\/quantora-modal>/;

/**
 * @returns {{ modalData: object|null, cleanText: string, repaired: boolean, failure: string|null }}
 *
 * cleanText has the marker removed WHETHER OR NOT the parse succeeded. That is
 * the half of this that is not about JSON: a modal we cannot read is our
 * problem, and showing the user a wall of raw braces makes it theirs.
 */
export function readAssistantModal(text) {
  const source = String(text || '');
  const match = source.match(MODAL_MARKER);
  if (!match) return { modalData: null, cleanText: source, repaired: false, failure: null };

  const cleanText = source.replace(match[0], '').trim();
  const raw = match[1];

  try {
    return { modalData: JSON.parse(raw), cleanText, repaired: false, failure: null };
  } catch {
    /* fall through to the one repair worth making */
  }

  try {
    return { modalData: JSON.parse(escapeControlCharsInStrings(raw)), cleanText, repaired: true, failure: null };
  } catch (error) {
    // Reported, not thrown, and never rendered as itself.
    return { modalData: null, cleanText, repaired: false, failure: String(error?.message || 'unparseable modal') };
  }
}
