/**
 * Provenance for the Research desk's source ledger.
 *
 * THE INCIDENT
 *
 * The Research board derives its whole evidence ledger by parsing the AI
 * reply's text: a `**Sources**` heading followed by numbered markdown links.
 * The server appends exactly that block when — and only when — a grounded
 * search actually returned sources.
 *
 * Nothing distinguished the server's block from one the model typed itself.
 * Feeding the board a reply in which the model wrote its own block, with two
 * invented URLs, produced:
 *
 *     groundedTurns  1        (the board called the turn grounded)
 *     ungroundedTurns 0
 *     sources         2       (nejm.org, novonordisk.com — neither fetched)
 *     findings        2       attributed to "this reply's sources"
 *
 * The identical reply WITHOUT those six lines produced the honest opposite:
 * groundedTurns 0, and the banner "Nothing here is backed by live sources yet."
 *
 * So the model controlled its own audit trail. Typing the block the domain
 * directive tells it not to type flipped the board from a warning into a
 * confident evidence ledger. research-brief.js promises "a source row exists
 * only because a grounded reply actually listed it" — and could not keep it.
 *
 * WHY THIS IS NOT AN ADVERSARIAL EDGE CASE
 *
 * chat-handler feeds prior assistant turns back to the model verbatim, so the
 * model SEES the server's block format in its own context on every subsequent
 * turn. Imitating it is the most natural thing a next-token predictor can do.
 * This was waiting to happen, not a jailbreak.
 *
 * THE MARKER, AND WHY IT IS THIS ONE
 *
 * `[//]: # (...)` is a link reference definition: valid markdown that resolves
 * to nothing and renders as nothing. Measured, not assumed — an HTML comment
 * was the obvious first choice and is WRONG here, because react-markdown runs
 * without rehype-raw and escapes it, so the reader would have seen
 * `<!--quantora-grounded-->` printed in the chat. A zero-width sequence
 * survives into the DOM and is fragile under any Unicode normalisation. The
 * link-reference form is the only candidate that rendered to nothing.
 *
 * A marker in model-visible text is only worth anything if the model never
 * sees it — otherwise it gets imitated along with everything else. That is
 * what stripGroundingMarker is for, and it is not optional: it runs over the
 * history on its way to EVERY inference path. Without it this marker would be
 * decorative within one turn, which is worse than no marker at all.
 */

/** The exact line the server writes above a source block it is standing behind. */
export const GROUNDING_MARKER = '[//]: # (quantora-grounded)';

/**
 * Matches the marker as a whole line. Tolerant of surrounding whitespace only
 * — the marker is machine-written, so anything looser would just be a wider
 * target for imitation.
 */
export const GROUNDING_MARKER_LINE = /^[ \t]*\[\/\/\]:[ \t]*#[ \t]*\(quantora-grounded\)[ \t]*$/;

/**
 * The block the server appends, marker included, for `sources` it actually
 * fetched. One function so the two call sites in chat-handler cannot drift
 * apart — and so the client parser has exactly one shape to expect.
 */
export function buildGroundedSourceBlock(sources = [], limit = 5) {
  const rows = (Array.isArray(sources) ? sources : []).slice(0, limit);
  if (!rows.length) return '';
  let block = `\n\n---\n\n${GROUNDING_MARKER}\n\n**Sources**\n`;
  rows.forEach((source, index) => {
    /*
     * A bracket in a title closes the markdown link early, so the rest of the
     * title becomes prose and the URL never renders as a link — and the board's
     * SOURCE_LINE regex stops matching the row, silently dropping a real source
     * from the ledger. research-deep-dive stripped these; chat-handler did not.
     * Consolidating the two emitters is what surfaced the difference, so the
     * safer half now applies to both.
     */
    const title = String(source?.title || source?.uri || '').replace(/[[\]]/g, '');
    block += `${index + 1}. [${title}](${source?.uri ?? ''})\n`;
  });
  return block;
}

/**
 * Remove every marker line from a reply before it re-enters model context.
 *
 * The source block itself stays. The model may still imitate the block — and
 * that is fine, because an unmarked block is counted as ungrounded and the
 * board says so honestly. What it must never be able to do is reproduce the
 * server's claim of provenance.
 */
export function stripGroundingMarker(text) {
  if (typeof text !== 'string' || !text.includes('quantora-grounded')) return text;
  return text
    .split('\n')
    .filter((line) => !GROUNDING_MARKER_LINE.test(line))
    .join('\n');
}

/** Apply stripGroundingMarker to a history message, leaving every other field alone. */
export function stripGroundingMarkerFromMessage(message) {
  if (!message || typeof message.text !== 'string') return message;
  const text = stripGroundingMarker(message.text);
  return text === message.text ? message : { ...message, text };
}
