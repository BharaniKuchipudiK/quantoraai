/**
 * Why the wand did nothing, in words the person who clicked it can act on.
 *
 * THE INCIDENT (2026-09-04). "When I click on Magic Wand, nothing happens. It
 * sits duck." It was not dead. /api/enhance answers with SEVEN distinct
 * failures — 401 unauthenticated, 405, 400 bad prompt, 413 too long, 429 rate
 * limited (two separate paths), 503 no GEMINI key, 500 — and every one of them
 * landed here:
 *
 *     } else if (!res.ok) {
 *       console.error("Magic Wand failed:", data.error);
 *     }
 *
 * A console line is not a user interface. The spinner stopped, the draft did
 * not change, and the only available reading was "this button is broken".
 *
 * Each status maps to the ONE thing that would unblock the person, because a
 * message that does not say what to do next is only a prettier silence. The
 * server's own error text is preferred where it exists and is short enough to
 * read: it knows more than a status code does.
 */

const NEXT_STEP = {
  401: 'Sign in and try the wand again.',
  403: 'Sign in and try the wand again.',
  429: 'The wand is rate limited — wait about a minute and try again.',
  413: 'That draft is too long for the wand. Shorten it and try again.',
  400: 'The wand could not read that draft.',
  503: 'Prompt polishing is not configured on this deployment, so the wand cannot run here.',
};

/**
 * @param {{ status?: number, payload?: any, networkError?: unknown }} input
 * @returns {string} a sentence to show the user, never empty
 */
export function promptPolishFailureMessage({ status = 0, payload = null, networkError = null } = {}) {
  if (networkError) {
    const detail = networkError instanceof Error ? networkError.message : String(networkError || '');
    return `The wand could not reach the server${detail ? ` (${detail})` : ''}. Your draft is unchanged.`;
  }

  const served = typeof payload?.error === 'string' ? payload.error.trim() : '';
  const step = NEXT_STEP[status];

  if (step && served && served.length <= 160 && !/^\s*$/.test(served)) {
    // Both halves earn their place: the server says what happened, we say what
    // to do about it. Neither alone has been enough.
    return `${served} ${step}`;
  }
  if (step) return step;
  if (served && served.length <= 160) return `${served} Your draft is unchanged.`;

  /*
   * The unknown status. It must still name the status, because "something went
   * wrong" sends the next person to read the console — which is exactly the
   * state this function exists to end.
   */
  return `The wand failed${status ? ` (HTTP ${status})` : ''} and your draft is unchanged.`;
}
