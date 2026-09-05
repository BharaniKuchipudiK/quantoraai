/**
 * WHY DID THE MODEL STOP?
 *
 * Every provider says. OpenRouter puts `finish_reason` on the last choice;
 * Gemini puts `finishReason` on the last candidate. `stop` / `STOP` means the
 * model chose to end. `length` / `MAX_TOKENS` means WE cut it off — the reply
 * hit the output budget and the rest of the answer was never generated.
 *
 * Until 2026-09-05 the live chat turn read neither. Only the health probes did,
 * and the Gemini probe's own header records the consequence:
 *
 *   "That is the fact the platform never surfaced anywhere, and it is the
 *    difference between 'the model cannot do this' and 'we cut it off'."
 *
 * HOW IT WAS FOUND. The deployed golden failed at guided intake with the
 * decision modal unreadable — "Unterminated string in JSON at position 106".
 * A cut-off reply landing in JSON breaks LOUDLY, which is the only reason it
 * was noticed. The same cut-off landing in prose is silent: the answer simply
 * ends early, the turn is recorded as a success, and neither the platform nor
 * the user knows. The modal was the visible symptom of a class invisible
 * everywhere else.
 *
 * Same shape as every defect that week: the information existed, a boundary
 * did not carry it, the next layer guessed.
 *
 * WHAT THIS IS NOT. It is not a repair. A reply cut at the budget cannot be
 * completed on our side without inventing the rest. What it does is make the
 * cut a NAMED outcome — a build attempt that was truncated is refused so the
 * route ladder tries elsewhere; a chat reply that was truncated is delivered
 * with the user told — instead of a silently shorter answer.
 */

export type StreamFinishKind = 'complete' | 'truncated' | 'blocked' | 'unknown';

export type StreamFinish = {
  kind: StreamFinishKind;
  /** The provider's own word, verbatim, or null when none arrived. */
  reason: string | null;
};

/** OpenRouter (OpenAI-shaped) stream event → finish_reason, or null. */
export function finishFromOpenRouter(parsed: any): string | null {
  const reason = parsed?.choices?.[0]?.finish_reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

/** Gemini stream chunk (SDK or raw) → finishReason, or null. */
export function finishFromGemini(chunk: any): string | null {
  const reason = chunk?.candidates?.[0]?.finishReason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

/*
 * The vocabularies, kept apart so a Gemini word is never read as an OpenRouter
 * one. Both lists are the providers' documented values; the classifier is
 * deliberately conservative — anything it does not recognise is `unknown`,
 * never `complete`, because a missing or unfamiliar terminal reason is the
 * probe's "connection closed before the model finished" case, and treating
 * that absence as consent is how a ledger gets poisoned.
 */
const COMPLETE = new Set([
  'stop', 'end_turn', 'tool_calls', 'function_call', // OpenAI-shaped
  'STOP',                                            // Gemini
]);
const TRUNCATED = new Set([
  'length', 'max_tokens',                            // OpenAI-shaped
  'MAX_TOKENS',                                      // Gemini
]);
const BLOCKED = new Set([
  'content_filter',                                  // OpenAI-shaped
  'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', // Gemini
]);

export function classifyFinish(reason: string | null | undefined): StreamFinish {
  const word = typeof reason === 'string' ? reason.trim() : '';
  if (!word) return { kind: 'unknown', reason: null };
  if (COMPLETE.has(word)) return { kind: 'complete', reason: word };
  if (TRUNCATED.has(word)) return { kind: 'truncated', reason: word };
  if (BLOCKED.has(word)) return { kind: 'blocked', reason: word };
  return { kind: 'unknown', reason: word };
}

/**
 * The error a BUILD attempt raises when its artifact was cut off. Carried as a
 * retryable status so the existing route ladder treats it like any other rung
 * that ran and did not deliver — the next engine is a different experiment,
 * which is the one kind of retry this repo permits.
 */
export function truncatedArtifactError(gateway: string, reason: string | null): Error {
  return Object.assign(
    new Error(
      `${gateway} cut the build off at its output budget (finish_reason ${reason || 'missing'}). `
      + 'A truncated artifact is not a deliverable; trying another route.',
    ),
    { status: 502, detailCode: 'reply-truncated' },
  );
}
