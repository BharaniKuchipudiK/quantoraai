/**
 * How many of the golden's transactions this run plans, in roster order.
 *
 * 2026-09-06: two thirds of the month's Gemini bill belonged to the key the PR
 * preview deployments use. The golden ran about seventy times in fifteen
 * hours, once per push on every pull request and once per production
 * deploy, and every run was five build-size turns. A pull request needs to
 * prove the deployment answers and builds; production proves all five. So a
 * run plans a PREFIX of the roster — the first N — and the roster check at
 * the end holds the run to exactly what it planned, never less.
 *
 * Unset, blank, zero, negative or not a number means the whole roster, so a
 * run that forgets the variable covers more, never less.
 */
export function planGoldenTransactions(roster, limitValue) {
  const all = Array.isArray(roster) ? roster.slice() : [];
  const parsed = Number(String(limitValue ?? '').trim());
  const limit = Number.isFinite(parsed) && parsed >= 1 ? Math.min(all.length, Math.floor(parsed)) : all.length;
  return { limit, planned: all.slice(0, limit), total: all.length };
}
