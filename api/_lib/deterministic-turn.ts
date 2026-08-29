/**
 * The shape of a deterministic answer, in one place.
 *
 * A deterministic gateway returns out of api/pipeline.ts BEFORE the
 * conversation engine runs. Everything the conversation engine would have
 * added — follow-up options, and the facts the next turn needs — has to be
 * carried by the answer itself or it is simply absent, and the turn dead-ends.
 *
 * Every gateway rediscovered that the hard way, one at a time: debt shipped a
 * payoff plan with no next move, savings shipped a projection with no next
 * move, and the judgment gate caught the second only because the first had
 * already taught it what to look for. Encoding the protocol here means the
 * NEXT engine inherits it instead of learning it.
 *
 * Both markers are stripped from the visible reply by the client and consumed
 * as structure, so this is metadata, never prose the user reads.
 */

export type NextMove = {
  id: string;
  title: string;
  description: string;
  /**
   * Posted verbatim AS the user's next message, so it must be a whole sentence.
   * A fragment sends a broken message on their behalf.
   */
  value: string;
};

export type DeterministicTurn = {
  /** The answer itself. */
  text: string;
  /** What to offer next. Two or more, or none at all — one option is a nag. */
  question?: string;
  moves?: NextMove[];
  /** What the next turn should know so the user never restates it. */
  facts?: string[];
};

/**
 * Assembles the answer, its follow-ups, and its memory into the single string a
 * gateway streams. Silently omits a block rather than emitting an empty one: a
 * malformed marker is worse than a missing one, because the client would strip
 * it from the prose and show nothing in its place.
 */
export function withNextMoves({ text, question, moves, facts }: DeterministicTurn): string {
  const parts = [text];

  const usable = (moves || []).filter((move) => move?.id && move?.title && move?.value);
  if (usable.length >= 2) {
    parts.push(`\n\n<quantora-modal>\n${JSON.stringify({
      question: question || "What next?",
      options: usable,
    })}\n</quantora-modal>`);
  }

  const memory = (facts || []).map((fact) => String(fact || "").trim()).filter(Boolean);
  if (memory.length) {
    parts.push(`\n<!-- quantora-ctx: ${JSON.stringify({ facts: memory })} -->`);
  }

  return parts.join("");
}
