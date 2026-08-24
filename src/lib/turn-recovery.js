/**
 * When a turn fails, the desk should try to rescue it before asking the person
 * to. The server already decides whether a failure is worth another attempt and
 * streams that as `error.retryable`, and a build-contract failure literally says
 * "retry and I will rebuild" — but nothing on the client ever read either, so
 * every failure ended as a dead message the user had to nurse.
 *
 * Bounded on purpose: one extra attempt, never a loop.
 */

export const MAX_TURN_ATTEMPTS = 2;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const FATAL_STATUS = new Set([401, 402, 403]);

export function resolveTurnRecovery({
  attempt = 1,
  status = 0,
  code = '',
  retryable = false,
  hasPartialText = false,
  stoppedByUser = false,
  timedOut = false,
  networkError = false,
} = {}) {
  const no = (reason) => ({ retry: false, notice: '', reason });

  if (stoppedByUser) return no('stopped');
  if (Number(attempt) >= MAX_TURN_ATTEMPTS) return no('attempts-exhausted');

  // The deadline is the budget for the whole turn, not per attempt.
  if (timedOut) return no('timed-out');

  if (FATAL_STATUS.has(Number(status))) return no('credentials');

  // Chat-only "plans" on Coding Desk often arrive as a full paragraph before
  // we notice there were no fences. Rebuild anyway — Preview/files are the
  // product, not the prose that already rendered.
  if (code === 'BUILD_ARTIFACT_CONTRACT') {
    return {
      retry: true,
      notice: 'Those files could not run in Preview. Rebuilding once…',
      reason: 'build-contract',
    };
  }

  // A half-written answer is worse to restart than to keep: the person already
  // read the first paragraph.
  if (hasPartialText) return no('partial-answer');

  if (retryable === true || RETRYABLE_STATUS.has(Number(status))) {
    return {
      retry: true,
      notice: 'That model route failed. Trying once more…',
      reason: 'route',
    };
  }

  if (networkError) {
    return {
      retry: true,
      notice: 'The connection dropped. Retrying once…',
      reason: 'network',
    };
  }

  return no('not-retryable');
}
