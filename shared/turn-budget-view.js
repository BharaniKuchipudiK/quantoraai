/*
 * WHAT A PERSON SEES OF THEIR OWN ALLOWANCE.
 *
 * Until 2026-09-08 Quantora showed nothing: no count, no bar, no reset. The
 * only way to learn where you stood was to be refused, and the refusal said
 * the turns "reset within 24 hours" -- the same sentence one minute before
 * the reset and twenty-three hours before it. A student on a borrowed key
 * could not tell whether to wait for lunch or come back tomorrow, and the
 * platform's owner hit the same wall on his own product.
 *
 * Shared by the server that writes the sentence and the desk that draws the
 * bar, so the two can never disagree about what a number means -- the drift
 * this repo has paid for before, where two ends of one contract were written
 * twice and diverged in silence.
 */

/**
 * "in 14h", "in 2h 3m", "in 12m", "shortly" — a duration, never a timestamp.
 *
 * Someone deciding whether to wait needs an interval, not an instant in a
 * timezone they may not be in. Returns null when there is no reset time to
 * report, so every caller says less rather than inventing one.
 */
export function describeResetIn(resetsAt, now = Date.now()) {
  const at = Date.parse(String(resetsAt || ''));
  if (!Number.isFinite(at)) return null;
  const ms = at - now;
  /* Past, or inside a minute: "in 0m" reads as a stuck clock at the exact
   * moment the news is good. */
  if (ms <= 60_000) return 'shortly';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

/**
 * The whole meter as data, so the component only draws.
 *
 * Returns null when there is nothing honest to show. That is the load-bearing
 * case: a budget whose counter the store could not answer for has `used`
 * null, and a bar drawn from a null reads as EMPTY — the most reassuring
 * possible picture, produced by knowing nothing. A meter that cannot be
 * trusted must be absent, not optimistic.
 */
export function turnBudgetView(budget, now = Date.now()) {
  if (!budget || typeof budget !== 'object') return null;
  const limit = Number(budget.limit);
  const used = budget.used === null || budget.used === undefined ? null : Number(budget.used);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  if (used === null || !Number.isFinite(used) || used < 0) return null;

  /* Counted turns can exceed the limit: the refusal itself is a hit, so the
   * bar is clamped rather than allowed past its own end. */
  const remaining = Math.max(0, limit - used);
  const percentUsed = Math.min(100, Math.round((used / limit) * 100));
  return {
    used,
    limit,
    remaining,
    percentUsed,
    exhausted: remaining === 0,
    /* Shared means everyone is waiting, and the copy must not read as the
     * person's own doing. */
    shared: budget.scope === 'platform',
    resetsIn: describeResetIn(budget.resetsAt, now),
  };
}
