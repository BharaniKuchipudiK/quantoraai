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
 * removal, no bracket completion, no smart-quote or single-quote rewriting, no
 * stripping of comments or of prose wrapped around the object. Each of those
 * guesses at intent and can invent an option the model never offered, which on
 * a decision modal means putting words in its mouth and then acting on the
 * user's click.
 *
 * The bar is INFORMATION-PRESERVING, and exactly two deviations clear it:
 *
 *   1. Control characters inside strings. The character was already there;
 *      only its encoding was wrong.
 *   2. A markdown code fence around the whole body (2026-09-05, below). The
 *      fence is packaging, not content — removing it changes nothing about
 *      what the model said.
 *
 * ADDED 2026-09-05, AND HOW IT WAS FOUND
 *
 * The night this module shipped, the deployed golden went red again at
 * guided-intake. The verdict — added the same night for exactly this purpose —
 * said which of three failures it was:
 *
 *   GOLDEN VERDICT | failed at: guided-intake | why: The guided-intake turn
 *   wrote a decision modal the desk could not READ, so nothing rendered.
 *
 * modalUnreadable: true, and the transcript ended "So, first thing:" — the
 * model had obeyed, written its prose, and handed over to a modal we then
 * dropped. A boolean was enough to name the class and not the instance, so the
 * failure REASON is now published too: a gate that says "unreadable" without
 * saying why is one round short of a diagnosis (§8).
 *
 * A model that fences its JSON is being conventional, not malformed. Every
 * other code block it emits is fenced, and the directive it is following shows
 * a raw block — so this is the same shape as the newline: the platform
 * punishing the model for a habit it was never told to drop.
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
 * A markdown fence around the ENTIRE body, and only then.
 *
 * Anchored at both ends so a stray ``` inside a question is left alone: an
 * unbalanced or partial fence is ambiguous, and ambiguity is where inventing
 * structure starts. Returns the input unchanged when it does not match.
 */
const WHOLE_BODY_FENCE = /^\s*```[a-z]*\s*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/i;

function unwrapCodeFence(raw) {
  const match = String(raw).match(WHOLE_BODY_FENCE);
  return match ? match[1] : raw;
}

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
    /* fall through to the repairs worth making */
  }

  /*
   * Both repairs, then both together — a fenced two-line question is one
   * message, not two problems, and it was the shape that reached production.
   */
  const unfenced = unwrapCodeFence(raw);
  for (const candidate of [unfenced, escapeControlCharsInStrings(unfenced)]) {
    if (candidate === raw) continue;
    try {
      return { modalData: JSON.parse(candidate), cleanText, repaired: true, failure: null };
    } catch {
      /* try the next repair */
    }
  }

  try {
    return { modalData: JSON.parse(escapeControlCharsInStrings(raw)), cleanText, repaired: true, failure: null };
  } catch (error) {
    /*
     * Reported, not thrown, and never rendered as itself — WITH the bytes.
     *
     * "unreadable" named the class and cost a round. The parser's message named
     * the instance and cost another, because "Unterminated string in JSON at
     * position 106" still does not say WHICH string or what preceded it, and I
     * guessed at the shape twice (a markdown fence, then truncation) without
     * ever seeing what the model wrote. A position with no text at that
     * position is a diagnosis nobody can act on (§8).
     *
     * So a short window around the reported offset travels too. It is the
     * model's own question — already on the page as prose — bounded to 60
     * characters, which is enough to tell an unescaped quote from a truncation
     * and not enough to be a transcript.
     */
    const message = String(error?.message || 'unparseable modal');
    const at = Number.parseInt((message.match(/position (\d+)/) || [])[1] ?? '', 10);
    const window = Number.isFinite(at)
      ? String(raw).slice(Math.max(0, at - 30), at + 30).replace(/\s+/g, ' ')
      : String(raw).slice(0, 60).replace(/\s+/g, ' ');
    return {
      modalData: null,
      cleanText,
      repaired: false,
      failure: `${message} | near: ${window}`,
    };
  }
}
