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
  /\?\s*$/,
  /\b(?:when|once|after|as soon as|until|if)\b[\s\S]*\b(?:done|complete|completed|finished|ready|built|live)\b/i,
  /\b(?:will|i'?ll|we'?ll|going to|about to|next step|then i|then we)\b/i,
  /\b(?:finished|completed|done)\s+(?:reading|looking|reviewing|going through|scanning|parsing|reviewing)\b/i,
  /\b(?:the|your|our|their)\s+(?:client|customer|consultant|candidate|team|staff|user|owner|manager|vendor|partner|employee|contractor|guest|patient|student|member)s?\s+(?:is|are|was|were|has|have)\b/i,
  /\b(?:could ?n[o']t|cannot|can'?t|couldn'?t|failed to|unable to|did ?n[o']t manage)\b/i,
  /\bcomplete (?:guess|rewrite|redesign|overhaul|nonsense|mystery)/i,
];

const READY_IS_NOT_DONE = [
  /\bready (?:to be\b|for\b)/i,
  /\bready to (?!use\b|go\b|ship\b|launch\b|publish\b|view\b|preview\b|deploy\b)[a-z]+\b/i,
];

const CLAIMS_DONE = [
  // "I have completed / I've finished / we built / I have now implemented…"
  /\b(?:i|we)\s*(?:'ve|'ve|have|had)?\s*(?:(?:just|now)\s+)?(?:completed|finished|built|created|implemented|added|wired(?: up)?|shipped|delivered|set up|put together)\b/i,
  /\b(?:your|the|this|it)\s+[\w\s-]{0,40}?(?:is|are|has been|have been)\s+(?:now\s+)?(?:done|complete|completed|finished|ready|live|built|up and running|working|functional|in place)\b/i,
  /^(?:all\s+(?:set|done)|done|finished|complete|completed|shipped|ready)\b\W*$/i,
  /^(?:all\s+(?:set|done)|done|finished|complete|completed|shipped)\b\s*[—–-]/i,
  /\bhere(?:'s| is|'re| are)\s+(?:your|the)\s+(?:finished|completed|new|working)\b/i,
  /\b(?:everything|that's everything|all of it)\b[\s\S]{0,40}\b(?:is|are|works|working|in place|done)\b/i,
  /\b(?:it|the (?:build|app|site|preview))\s+(?:works|succeeded|is running)\b/i,
  /\b(?:fully|now)\s+(?:built|functional|working|complete|live)\b/i,
];

export function claimsCompletion(response: string): boolean {
  for (const clause of clauses(response)) {
    if (NOT_A_CLAIM.some((pattern) => pattern.test(clause))) continue;
    const judged = READY_IS_NOT_DONE.some((pattern) => pattern.test(clause))
      ? clause.replace(/\bready\b/gi, ' ')
      : clause;
    if (CLAIMS_DONE.some((pattern) => pattern.test(judged))) return true;
  }
  return false;
}
