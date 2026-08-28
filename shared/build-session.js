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
 * Something gone wrong, or an instruction dressed as a question.
 *
 * On its own this is far too broad — "wrong", "still", "again", "can you show"
 * appear in questions about anything at all. It is only half the test.
 */
const TROUBLE = /\b(?:(?:not|doesn'?t|isn'?t|won'?t|didn'?t)\s+work\w*|broken|still|instead|missing|empty|blank|wrong|fail\w*|error|fix\w*|again|nothing happens|no code|can you (?:give|make|add|change|show|send|put|build|create|fix))\b/i;

/**
 * A reference to the thing being built.
 *
 * This is the other half, and the necessary one. "Why is the button not
 * working" is about the work; "what is wrong with the economy?" is not, and
 * they are separated by whether anything on screen is being named. Without this
 * check, a generic complaint word turned any question at all into a rebuild —
 * answering a question about the weather by regenerating somebody's page.
 */
/*
 * Note the `(?:s|es)?` rather than `\w*` on the noun group. `app\w*` matched
 * "approach", so "is that still the best approach in general?" read as a
 * reference to the app and turned a general question into a rebuild.
 */
const ARTIFACT_REFERENCE = /\b(it|this|that|these|those|my|the)\b[^?]{0,40}?\b(app|application|page|site|website|build|code|file|preview|screen|button|link|form|layout|header|footer|nav|menu|cart|checkout|total|price|image|photo|colou?r|font|text|title|table|chart|list|card|section|feature|version)(?:s|es)?\b|\b(?:it|this|that)\b\s*(?:is|'s|does|did|has|was)?\s*(?:not|n'?t)?\s*(?:work|load|show|open|display|render|save|run)\w*|\byou (?:gave|sent|made|built|wrote|showed)\b|\bno code\b|\bnothing happens\b/i;

/**
 * A build ask, judged more broadly than the cold classifier judges one.
 *
 * This exists because the first version asked `resolveIsCodingRequest` whether
 * the session had ever been a build — the same classifier whose misses this is
 * supposed to recover from. "build me a currency converter" is not recognised
 * by it (no matching noun), so a session opened that way never activated, and
 * the circular lock survived intact for exactly the asks that trip it. A
 * recovery built on the thing that failed recovers nothing.
 *
 * An imperative build verb with an object is enough. It does not force a build
 * on its own — it only says this session was trying to make something.
 */
const IMPERATIVE_BUILD = /\b(build|create|make|generate|design|develop|code|prototype|scaffold|clone|rebuild)\b\s+(?:me\s+)?(?:a|an|the|my|us\s+a|some)?\s*\w/i;

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
  return (priorUserMessages || []).some((message) => {
    if (typeof message !== 'string') return false;
    const t = message.trim();
    if (!t || QUESTION_ONLY.test(t)) return false;
    // Two signals, deliberately: the strict classifier, and a plain imperative
    // build ask it is known to miss.
    return isCodingRequest(t) || IMPERATIVE_BUILD.test(t);
  });
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
  /*
   * A question about the work is still about the work — but it has to BE about
   * the work. Trouble words alone are not enough: "what is wrong with the
   * economy?" and "can you show me today's weather?" carry them and have
   * nothing to do with the page.
   */
  return TROUBLE.test(t) && ARTIFACT_REFERENCE.test(t);
}
