/*
 * A ROUTE IS ALIVE WHEN IT PRODUCES CONTENT, NOT WHEN IT PRODUCES BYTES.
 *
 * On 2026-09-08 a build turn burned 176 seconds and returned nothing. The
 * trace showed one attempt running 89.7s against a 90s budget, on a route
 * that had a 20-SECOND idle guard the whole time.
 *
 * Both were true because the guard measured the wrong thing. OpenRouter keeps
 * a queued request warm by streaming `: OPENROUTER PROCESSING` comment lines.
 * The parser skips them -- `if (!line.startsWith('data: ')) continue` -- but
 * they arrive as BYTES, and every byte reset the idle timer. So a route that
 * produced no content at all looked continuously healthy, ran its entire
 * attempt budget, and left the fallback 45s of a 165s turn. The fallback then
 * failed too, and by then the turn's recovery budget was spent, so the
 * self-healing that exists could not fire.
 *
 * The platform's own measured average turn is ~28 seconds. A route silent for
 * 25 is not slow, it is gone.
 *
 * This is kept pure and shared so the rule can be tested without a provider,
 * a network, or a model call -- the three reasons nothing tested it before.
 */

/** How long a route may produce no CONTENT before it is abandoned. */
export const NO_CONTENT_MS = 25_000;

/**
 * A build asks for a much larger first answer than chat. Production showed the
 * fixed 25s chat window cancelling a flagship build at 25.5s even though the
 * route had a 110s attempt budget. Give builds ten more seconds, but keep the
 * bound below the 45s minimum build rung so an independent fallback still has
 * a viable slice inside the 165s server turn.
 */
export const BUILD_NO_CONTENT_MS = 35_000;

/** The silence bound for this kind of work, never longer than the attempt. */
export function contentSilenceWindowMs({ buildMode = false, attemptBudgetMs = Number.POSITIVE_INFINITY } = {}) {
  const windowMs = buildMode ? BUILD_NO_CONTENT_MS : NO_CONTENT_MS;
  const attemptMs = Number(attemptBudgetMs);
  if (!Number.isFinite(attemptMs)) return windowMs;
  return Math.max(0, Math.min(windowMs, attemptMs));
}

/**
 * How long the next read may block, given everything that bounds it.
 *
 * Returns 0 when the route has already been silent too long — the caller must
 * abandon rather than read again. Never returns more than any single bound,
 * because a read that outlives the no-content window makes the window a
 * suggestion.
 */
export function nextReadBudgetMs({
  now,
  lastContentAt,
  attemptStartedAt,
  attemptBudgetMs,
  idleMs,
  noContentMs = NO_CONTENT_MS,
}) {
  const sinceContent = Math.max(0, num(now) - num(lastContentAt));
  const noContentLeft = num(noContentMs) - sinceContent;
  const attemptLeft = num(attemptBudgetMs) - Math.max(0, num(now) - num(attemptStartedAt));
  /* Any bound at or below zero means stop, and stop is 0 rather than a
   * negative that a Math.min elsewhere would happily pass to a timer. */
  if (noContentLeft <= 0 || attemptLeft <= 0) return 0;
  return Math.max(0, Math.min(num(idleMs), noContentLeft, attemptLeft));
}

/**
 * Why the route is being abandoned, or null while it may continue.
 *
 * 'no-content' and 'attempt-budget' are separated deliberately: the first says
 * this route is not answering and another should be tried, the second says the
 * turn is running out of time overall. Reported as one thing, the first looks
 * like the platform being slow instead of a provider being dead.
 */
export function streamStopReason({
  now,
  lastContentAt,
  attemptStartedAt,
  attemptBudgetMs,
  noContentMs = NO_CONTENT_MS,
}) {
  if (num(now) - num(attemptStartedAt) >= num(attemptBudgetMs)) return 'attempt-budget';
  if (num(now) - num(lastContentAt) >= num(noContentMs)) return 'no-content';
  return null;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
