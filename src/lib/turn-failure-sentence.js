/**
 * What a person is told when a turn dies on the connection.
 *
 * WHY THIS EXISTS
 *
 * Every other terminal path in the stream already speaks properly. An HTTP
 * failure goes through responseErrorMessage, which names the status and says
 * whether retrying can help. A coding turn goes through resolveCodingTurnOutcome.
 * A turn whose desk was already proved says so and points at Preview.
 *
 * One path did not. A NON-coding turn — chat, travel, study, finance — that
 * died on the network rendered the browser's own words:
 *
 *   ⚠️ Connection Error: Failed to fetch
 *
 * "Failed to fetch" is what fetch() says when it cannot tell a dropped
 * connection from a blocked request from a DNS failure. It is accurate and
 * tells the reader nothing: not what happened, not whether their work survived,
 * not what to do next. It is the one place the product still hands someone a
 * dead end instead of a sentence.
 *
 * So this module owns that sentence. It never invents a cause it cannot know —
 * an unrecognised error keeps its own wording rather than being relabelled —
 * and it always ends with something the reader can actually do.
 */

/** Raw messages browsers produce when a fetch never reached a server. */
const OPAQUE_NETWORK_ERROR = /^(?:failed to fetch|fetch failed|network ?error|load failed|networkerror when attempting to fetch resource\.?|the internet connection appears to be offline\.?)$/i;

/**
 * @returns {{ text: string, isError: boolean, kind: string }}
 */
export function describeTurnFailure({
  kind = 'network',
  errorMessage = '',
  deadlineSec = 0,
  partialText = false,
} = {}) {
  const kept = partialText
    ? ' What arrived before it stopped is kept above.'
    : '';

  if (kind === 'stopped') {
    return {
      kind: 'stopped',
      isError: true,
      text: `⚠️ **Stopped.** Nothing further will run on this turn.${kept} Send another message when you want to carry on.`,
    };
  }

  if (kind === 'timeout') {
    const limit = Number(deadlineSec) > 0 ? ` after ${Math.round(Number(deadlineSec))} seconds` : '';
    return {
      kind: 'timeout',
      isError: true,
      text: `⚠️ **This turn ran out of time.** Quantora stopped it${limit} rather than leave it running with nothing to show.${kept}`
        + ' Asking for one part at a time usually gets through; the same prompt sent again will usually hit the same limit.',
    };
  }

  const raw = String(errorMessage || '').trim();

  // The browser could not reach the server at all, and cannot say why.
  if (!raw || OPAQUE_NETWORK_ERROR.test(raw)) {
    return {
      kind: 'network',
      isError: true,
      text: '⚠️ **The connection dropped before an answer came back.**'
        + ` Quantora already retried once.${kept}`
        + ' Nothing was lost on our side — send the message again, and if it keeps failing the network between you and the service is the thing to check, not your prompt.',
    };
  }

  /*
   * An error that says something specific keeps its own words. Rewriting a
   * message we did not generate would mean guessing at a cause, and a confident
   * wrong explanation is worse than an unfamiliar true one.
   */
  return {
    kind: 'network',
    isError: true,
    text: `⚠️ **The turn could not finish:** ${raw}`
      + `${kept} Quantora already retried once. Sending the message again is safe.`,
  };
}
