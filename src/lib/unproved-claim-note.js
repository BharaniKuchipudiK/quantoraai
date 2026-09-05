/**
 * QIR Phase 5 — the correction the desk owes when a reply claimed something the
 * platform cannot back.
 *
 * WHAT WAS WRONG
 *
 * conversation-engine.ts already catches this. A reply saying "your app is
 * ready" runs evaluateProofOfDone, and if nothing is verified it raises
 * `outcome_done_without_proof` at severity FAILURE. A reply saying "I've
 * emailed it" with no tool evidence raises `external_action_without_evidence`,
 * also a failure.
 *
 * Both were then carried to the client inside `conversation.verification` and
 * read by NOBODY. TechnicalAnalyticsPanel reads conversation.routing,
 * .evaluation, .responseContract, .move and .reasonCode — never .verification.
 * So the check ran, judged correctly, failed, and changed nothing: the user
 * read "your app is ready" with no correction anywhere on the screen.
 *
 * A check that cannot change an outcome is the §4 case, and it is worse than
 * no check because everyone downstream believes it is doing something.
 *
 * WHAT THIS DOES, AND WHAT IT CANNOT
 *
 * The reply is already streamed by the time the verdict exists — the engine's
 * own note says a buffered repair gate is a later phase — so the sentence
 * cannot be retracted. What it CAN do is stand next to it and say what is
 * missing, which is the same thing the desk already does for a patched
 * preview. A correction the user can check beats a claim they cannot.
 *
 * THE MAP IS EXHAUSTIVE ON PURPOSE
 *
 * Every failure code the engine can raise appears below, and a code that
 * deliberately shows nothing is written as null WITH ITS REASON rather than
 * omitted. Omission is indistinguishable from an oversight, and the test reads
 * conversation-engine.ts to make sure a new failure code cannot be added
 * without someone deciding what the user is told about it.
 */

export const UNPROVED_CLAIM_NOTES = {
  /*
   * The claim class this phase exists for. Deliberately says what is missing
   * rather than calling the model a liar: the criteria and the artifacts are
   * things the user can go and look at.
   */
  outcome_done_without_proof:
    'That reply said the work is done. **Nothing has verified it** — no success criterion is confirmed and no artifact is marked verified, '
    + 'so that is the model’s word, not the platform’s.',

  /*
   * The most serious of the four: an action the user believes happened in the
   * world. Named concretely, because "unsupported claim" would leave them
   * guessing which sentence to distrust.
   */
  external_action_without_evidence:
    'That reply said something was published, deployed, sent, booked or paid. **Quantora performed no such action this turn** and holds no receipt for one — '
    + 'nothing left this session.',

  /*
   * Not a claim the model made — a fact the provider reported: the reply hit
   * its output budget and the rest was never generated. Outranks the artifact
   * note below, because "nothing has verified it" is beside the point when the
   * answer is not all there. Says what to do, since the user can act on it.
   */
  reply_truncated:
    'This reply was **cut off** — the model reached its output limit before finishing, so what you see is not the whole answer. '
    + 'Ask for the rest, or ask for a shorter version.',

  /*
   * Nothing, on purpose. The desk already shows an empty reply as a failed turn
   * with its own recovery; a second note under a blank message would describe
   * what the user is already looking at.
   */
  empty_response: null,

  /*
   * Nothing, on purpose. The safety path decides what is shown or withheld and
   * owns its own copy; a note here would either duplicate it or contradict it,
   * and contradicting it is worse.
   */
  unsafe_output_detected: null,
};

/**
 * The one correction to show, or null.
 *
 * Failures only. Warnings are tuning signals for us — "too many questions",
 * "delivery too thin" — and putting them under a reply would train the user to
 * ignore the notes that matter.
 *
 * One at a time, most serious first: a claim about the outside world outranks a
 * claim about the artifact, because the user cannot check the first for
 * themselves.
 */
export function unprovedClaimNote(verification) {
  const issues = Array.isArray(verification?.issues) ? verification.issues : [];
  const failures = issues.filter((item) => item?.severity === 'failure' && typeof item?.code === 'string');
  if (!failures.length) return null;
  const order = ['external_action_without_evidence', 'reply_truncated', 'outcome_done_without_proof'];
  for (const code of order) {
    if (failures.some((item) => item.code === code) && UNPROVED_CLAIM_NOTES[code]) {
      return { code, text: UNPROVED_CLAIM_NOTES[code] };
    }
  }
  return null;
}
