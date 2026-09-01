/**
 * The Research board's chip prompts, and the marker contract that keeps them
 * honest — in ONE place.
 *
 * deriveResearchBrief must never mistake a board-steering turn for a new
 * research question: the heading would churn every time a chip was clicked.
 * The rule is textual — a steering prompt names "this board" — which means
 * the prompts and the filter can drift apart in silence if they live in
 * different files. So both sides import from here, and the contract test
 * asserts every steering prompt actually carries the marker. A prompt added
 * without it fails the suite instead of quietly rewriting the question.
 */

/** A user turn matching this steers the desk; it is not the question. */
export const RESEARCH_BOARD_STEERING = /\bthis board\b/i;

/** Prompts sent as complete turns. Every one of these MUST carry the marker. */
export const RESEARCH_BOARD_PROMPTS = {
  getSources: 'Re-answer the question on this board using live web sources, and cite them.',
  counterEvidence: 'Find credible counter-evidence to the findings on this board, with live sources.',
  crossCheck: 'Cross-check the findings on this board against publishers not already in its source ledger, with live sources.',
  draftBrief: 'Draft a concise research brief from the findings and sources on this board, clearly marking anything that is still unverified.',
  goDeeper: 'Investigate the question on this board using live web sources, and cite them.',
};

/**
 * Prefills the user completes before sending. These deliberately do NOT
 * carry the marker: "Narrow this down to residential solar" SHOULD become
 * the board's question — narrowing is a change of question, not steering.
 */
export const RESEARCH_BOARD_PREFILLS = {
  narrow: 'Narrow this down to ',
};
