/**
 * A build session stays a build session.
 *
 * WHY THIS EXISTS
 *
 * Every turn was classified from scratch by a pair of regexes over that one
 * message, with no memory that a build was already under way. `detectBuildIntent`
 * requires a build VERB and a build NOUN in the same sentence, and ordinary
 * follow-ups have neither: "the buttons do not work", "add a dark mode", "can
 * you give me the file instead", "it is still broken". Each of those was
 * classified as chat.
 *
 * The failure is circular, and that is what made it fatal. Falling back to
 * refine-mode required `hasDeskFiles`, so a session whose first turn produced
 * no files — a truncated stream, a provider failure, a missed classification —
 * could never get back in. Every later message was judged cold, cold judgement
 * needs verb-plus-noun, and conversation does not talk that way.
 *
 * What the person then experienced was the platform quietly becoming a
 * chatbot. And a general model asked for an app, with no desk and no preview,
 * answers the only way it can: open TextEdit, turn off smart quotes, paste
 * this, save as index.html, start a server. Instructions instead of an
 * artifact, handed to somebody who came here precisely because they cannot do
 * that.
 *
 * It is also the answer to "why can't the conversation continue naturally the
 * way it does in Cursor?" In an editor you are in a coding context and you stay
 * there. Here you had to re-earn it, in every sentence, forever.
 *
 * THE RULE
 *
 * Once this session has asked for something to be built, later turns belong to
 * that build unless they are plainly a question. Questions stay chat, so "how
 * does this work?" gets an answer rather than a rebuild. Everything else is
 * work on the thing we are making.
 */

/** Pure questions keep their answer. Everything else in a build session is work. */
const QUESTION_ONLY = /^(how|what|why|when|where|which|who|whose|should|could|would|is|are|was|were|do|does|did|can|will|explain|tell me|help me understand)\b/i;

/**
 * A question that is really an instruction.
 *
 * "Why is the button not working" and "can you give me the file instead" open
 * with question words and are unmistakably about the work. Treating them as
 * chat is how somebody ends up being told to open TextEdit.
 */
const WORK_DESPITE_QUESTION = /\b(?:(?:not|doesn'?t|isn'?t|won'?t|didn'?t)\s+work\w*|broken|still|instead|missing|empty|blank|wrong|fail\w*|error|fix\w*|again|nothing happens|no code|can you (?:give|make|add|change|show|send|put|build|create|fix))\b/i;

/**
 * Has this session already asked for something to be built?
 *
 * Derived from the messages we already have rather than stored, so it cannot
 * drift out of step with the transcript or be lost by a reload.
 */
export function isBuildSessionActive({
  priorUserMessages = [],
  codingDeskOpen = false,
  hasDeskFiles = false,
  isCodingRequest = () => false,
} = {}) {
  if (hasDeskFiles) return true;
  if (!codingDeskOpen) return false;
  return (priorUserMessages || []).some(
    (message) => typeof message === 'string' && isCodingRequest(message),
  );
}

/**
 * Does this turn belong to the build?
 *
 * Only ever ADDS turns to the build — it is consulted after the existing
 * classifier has said no, so it cannot take a turn away from anything that
 * already worked.
 */
export function turnBelongsToBuild({ text = '', buildSessionActive = false } = {}) {
  if (!buildSessionActive) return false;
  const t = String(text || '').trim();
  if (!t) return false;
  if (!QUESTION_ONLY.test(t)) return true;
  // A question about the work is still about the work.
  return WORK_DESPITE_QUESTION.test(t);
}
