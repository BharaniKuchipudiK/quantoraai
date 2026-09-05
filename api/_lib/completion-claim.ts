/**
 * QIR Phase 5 — DOES THIS REPLY CLAIM THE WORK IS DONE?
 *
 * The Outcome Contract binds the CLAIM, not the act: the desk may build
 * whatever it likes, but it may not tell the user the work is finished unless
 * a verifier says so. conversation-engine has enforced that on every turn for
 * a while — `claimsOutcomeDone` -> evaluateProofOfDone -> a failure issue ->
 * the note the user reads under the reply.
 *
 * The binding was real. The DETECTOR was a single prose regex, and measuring it
 * (2026-09-05) against fifteen ordinary completion claims and nine ordinary
 * non-claims gave:
 *
 *   RECALL     4/15 = 27%   "Shipped." "Done! Your storefront is up."
 *                           "All set — your CRM is live and working."
 *                           "The build succeeded and the preview is running."
 *   PRECISION  4/7  = 57%   "When it is done I will show you a preview."
 *                           "The deck is ready to be filled in once you send…"
 *                           "I have finished reading the file you shared."
 *
 * Both halves matter and they fail in opposite directions:
 *
 *   A MISS lets an unbacked "your app is ready" reach the user as fact. That is
 *   the claim this whole phase exists to bind, arriving unbound.
 *
 *   A FALSE POSITIVE prints "That reply said the work is done — nothing has
 *   verified it" under a reply that said no such thing. The platform
 *   contradicting a correct model, in front of the user, which is the exact
 *   shape that cost three incidents in one night (the intake modal discarded
 *   over a newline, the image url wrapped twice, the modal discarded over a
 *   markdown fence).
 *
 * So precision is the harder floor: 100%, and it may never drop. A correction
 * nobody trusts is worse than no correction, because the next person under
 * pressure deletes it (§5).
 *
 * WHY A REGEX AT ALL, AND WHY THAT IS NOT §6's MISTAKE
 *
 * §6 says anchor on durable hooks, never on prose. A completion CLAIM is prose
 * by definition — there is no data attribute for "the model said it was done",
 * so this cannot be hook-anchored the way a button can. What it can be is the
 * OTHER kind of gate this repo already has: a correctness gate with a corpus,
 * two numbers that pull against each other, and an adversarial set held apart
 * (see travel-comprehension.test.js). Recall bought by loosening this file
 * shows up immediately as a false positive on the adversarial set, and that
 * trade has to stay visible.
 *
 * DELIBERATE LOSSES ARE NAMED, NOT ABSORBED — see KNOWN_UNHEARD in the test.
 */

/** Sentence-ish split. Keeps the trailing punctuation so "?" is still visible. */
function clauses(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?\n])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/*
 * A clause that carries any of these is NOT asserting present completion, even
 * when it also contains a completion word. Checked FIRST, because precision is
 * the floor that may never drop.
 */
const NOT_A_CLAIM = [
  // A question about readiness is not an assertion of it.
  /\?\s*$/,

  // Future or conditional: the completion is promised, not reported.
  /\b(?:when|once|after|as soon as|until|if)\b[\s\S]*\b(?:done|complete|completed|finished|ready|built|live)\b/i,
  /\b(?:will|i'?ll|we'?ll|going to|about to|next step|then i|then we)\b/i,

  // Finishing an INPUT is not finishing the work. This is the one that fired on
  // "I have finished reading the file you shared."
  /\b(?:finished|completed|done)\s+(?:reading|looking|reviewing|going through|scanning|parsing|reviewing)\b/i,

  /*
   * A PERSON as the grammatical subject. "The client is done with discovery"
   * is a fact about the user's business; our artifact is not mentioned. Same
   * class as the coffee shop that is ready to open, and as the travel parser
   * offering hotels in "Sarah" — the subject of the work is not the work.
   *
   * Adjacency matters: this must fire on "the client IS done" and NOT on "your
   * client dashboard is ready", which is a real claim about a real deliverable.
   * The noun has to be the thing doing the being.
   */
  /\b(?:the|your|our|their)\s+(?:client|customer|consultant|candidate|team|staff|user|owner|manager|vendor|partner|employee|contractor|guest|patient|student|member)s?\s+(?:is|are|was|were|has|have)\b/i,

  // An explicit failure or refusal, which the desk handles as a failed turn.
  /\b(?:could ?n[o']t|cannot|can'?t|couldn'?t|failed to|unable to|did ?n[o']t manage)\b/i,

  // "complete guesswork", "complete rewrite" — adjectival, not a status.
  /\bcomplete (?:guess|rewrite|redesign|overhaul|nonsense|mystery)/i,
];

/*
 * "ready" ALONE, hedged.
 *
 * These disqualify the WORD "ready" as a completion signal, not the clause that
 * contains it — a distinction that cost a round. The first draft put them in
 * NOT_A_CLAIM, where one hedged word vetoed the whole sentence, and
 * conversation-engine.test.ts failed on a fixture my own corpus had missed:
 *
 *   "The presentation is complete and ready for you to use."
 *
 * That IS a claim — it says "is complete" independently — and a blanket veto
 * silently swallowed it. The corpus that motivated a fix is never the whole
 * corpus (§ "the corpus cannot only contain the cases that motivated the fix");
 * an existing gate caught what mine did not, so the case is now in CLAIMS.
 *
 * "ready TO <verb>" is readiness for a next action, and the verb after it is
 * usually about the user's BUSINESS: "The coffee shop is ready to open at 7am."
 * Ready-to-ANYTHING is hedged, except the short list that does mean the
 * deliverable itself is finished.
 */
const READY_IS_NOT_DONE = [
  /\bready (?:to be\b|for\b)/i,
  /\bready to (?!use\b|go\b|ship\b|launch\b|publish\b|view\b|preview\b|deploy\b)[a-z]+\b/i,
];

/*
 * A clause matching any of these asserts the deliverable exists and is finished.
 * Every entry earned its place from a measured miss; none is speculative.
 */
const CLAIMS_DONE = [
  // "I have completed / I've finished / we built / I implemented all five…"
  /\b(?:i|we)\s*(?:'ve|'ve|have|had)?\s*(?:just\s+)?(?:completed|finished|built|created|implemented|added|wired(?: up)?|shipped|delivered|set up|put together)\b/i,

  // "your app is ready", "the site has been built", "the CRM is now live"
  /\b(?:your|the|this|it)\s+[\w\s-]{0,40}?(?:is|are|has been|have been)\s+(?:now\s+)?(?:done|complete|completed|finished|ready|live|built|up and running|working|functional|in place)\b/i,

  // A bare assertion, standing as its own clause: "Done!" "Shipped." "All set —"
  /^(?:all\s+(?:set|done)|done|finished|complete|completed|shipped|ready)\b\W*$/i,
  /^(?:all\s+(?:set|done)|done|finished|complete|completed|shipped)\b\s*[—–-]/i,

  // "Here's your finished CRM." / "Here is the completed deck."
  /\bhere(?:'s| is|'re| are)\s+(?:your|the)\s+(?:finished|completed|new|working)\b/i,

  // "everything you asked for is in place", "that's everything working"
  /\b(?:everything|that's everything|all of it)\b[\s\S]{0,40}\b(?:is|are|works|working|in place|done)\b/i,

  // "it works", "the build succeeded", "the preview is running"
  /\b(?:it|the (?:build|app|site|preview))\s+(?:works|succeeded|is running)\b/i,

  // "fully built", "fully functional", "up and running"
  /\b(?:fully|now)\s+(?:built|functional|working|complete|live)\b/i,
];

/**
 * True when the reply asserts, in the present, that the requested work is
 * finished. Clause-scoped so one hedged sentence cannot mute a claim made in
 * the next one, and one claim cannot be manufactured out of two unrelated
 * halves.
 */
export function claimsCompletion(response: string): boolean {
  for (const clause of clauses(response)) {
    if (NOT_A_CLAIM.some((pattern) => pattern.test(clause))) continue;
    /*
     * A hedged "ready" is struck from the clause rather than vetoing it, so a
     * sentence that ALSO says "is complete" is still heard.
     */
    const judged = READY_IS_NOT_DONE.some((pattern) => pattern.test(clause))
      ? clause.replace(/\bready\b/gi, ' ')
      : clause;
    if (CLAIMS_DONE.some((pattern) => pattern.test(judged))) return true;
  }
  return false;
}
