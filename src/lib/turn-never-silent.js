/**
 * A turn may fail. It may not say nothing.
 *
 * THE DEFECT, READ FROM A SCREENSHOT (2026-09-04). Two consecutive Coding desk
 * turns — "Is the preview ready" and "Can yo build this platfrom form me" —
 * rendered as completely empty assistant bubbles. No text, no error, no
 * explanation. The user could not tell whether the platform was thinking, had
 * refused, had crashed, or had silently succeeded.
 *
 * WHY IT HAPPENED, AND WHY IT WILL HAPPEN AGAIN WITHOUT THIS.
 *
 * The desk already has good terminal copy: describeTurnFailure for network,
 * timeout and Stop; responseErrorMessage for a rejected response;
 * resolveCodingTurnOutcome for a build that produced nothing. Every one of them
 * is a HANDLER — honesty distributed across the paths that remembered to write
 * it. The message is created with `text: ''` and the turn's own terminal
 * `finally` only cleared the generating flag; nothing anywhere asked whether
 * the user had been told anything at all.
 *
 * So the guarantee was never "the user always gets an answer". It was "every
 * author of every exit path remembers to write one", and each new path is a
 * fresh chance to miss. That is why it reads as hit-and-miss: it IS hit-and-miss.
 *
 * THE RULE. The guarantee belongs at the boundary every turn passes through,
 * not in the handlers. An outcome is not promised — providers fail, budgets run
 * out, models go down. A RESPONSE is, and unlike an outcome it is a closed
 * property: when the turn is over and there is still nothing to read, say so.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not guess a cause. "All engines
 * are busy" is a real message the desk already sends when it has the evidence
 * for it (a dead route, a spent retry budget); inventing that here — where all
 * we know is that nobody wrote anything — would be the tool-description defect
 * from CLAUDE.md in a new place: a plausible reason the user reads as fact.
 * This is the last resort, and it says exactly that.
 *
 * It also never replaces. It only fills a message that is empty, so the
 * never-discard invariant is untouched by construction.
 */

/**
 * Is there genuinely nothing here for a person to read?
 *
 * Text is the main channel, but a turn can legitimately render through a proof
 * card, a build job, or a choice set with no prose at all. Those are answers,
 * so they are not silence.
 *
 * @param {object|null|undefined} message
 * @returns {boolean}
 */
export function turnIsSilent(message) {
  if (!message || typeof message !== 'object') return false;
  if (String(message.text || '').trim()) return false;

  // Any other surface the user can actually read counts as a reply.
  if (message.codingProof) return false;
  if (message.buildJob) return false;
  if (message.choiceSet) return false;
  if (message.continueSet) return false;
  if (String(message.modelA?.text || '').trim()) return false;
  if (String(message.modelB?.text || '').trim()) return false;

  return true;
}

/**
 * What to say when the turn ended and nothing was said.
 *
 * Three things, in the order a person needs them: that it is our fault and not
 * a refusal, that their work is intact, and what to do next. The correlation id
 * rides along when there is one so a report has a handle.
 *
 * @param {object|null|undefined} message
 * @returns {string}
 */
export function describeSilentTurn(message) {
  const base = 'This turn ended without a reply — that is a fault on Quantora\'s side, not a refusal '
    + 'and not a limit you hit. The desk could not confirm a completed response. '
    + 'Your request remains in this chat. Check the current desk before using Retry.';
  const correlationId = String(message?.correlationId || '').trim();
  return correlationId ? `${base}\n\nReference: ${correlationId}` : base;
}
