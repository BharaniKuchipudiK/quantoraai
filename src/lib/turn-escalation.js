/**
 * How far the turn-level loop is allowed to climb — decided from evidence.
 *
 * THE LAW BEING ENFORCED (docs/engineering/DETECT_DIAGNOSE_VERIFY_APPLY.md):
 *
 *   EVIDENCE-BASED STOP — the loop ends on a pass, a plateau, an unchanged
 *   repair, or a spent budget, never merely because it tried once.
 *
 * The artifact level already obeys it (`planRefinementRound`). The turn level
 * did not: `MAX_TURN_ATTEMPTS = 2` stopped the loop by COUNTING, which is the
 * one stop condition the standard forbids. Two consequences, both of them the
 * user's whole experience of the platform:
 *
 *   1. THE LADDER HAD ONE RUNG. `nextFallbackEngine()` already walks the entire
 *      live catalogue, so the Sonnet -> Opus -> next escalation was built. It
 *      was allowed a single step, then the turn apologised. Most real failures
 *      are FAST - a 502, a 429, a dead route, a dropped stream, all inside a
 *      few seconds - so the apology arrived with ~170s of the budget unspent.
 *
 *   2. THE LAST ATTEMPT WAS DOOMED ON PURPOSE. The old budget arithmetic was
 *      `Math.max(MIN_ATTEMPT_BUDGET_MS, deadline - elapsed)`: a FLOOR. With 3s
 *      left on a 175s turn it still started a 20s attempt that could not finish,
 *      then reported the same failure 20 seconds later, having billed the
 *      tokens. A floor under a spent budget does not buy an attempt; it buys a
 *      slower way to lose.
 *
 * So the floor becomes a THRESHOLD. An attempt runs when the remaining budget
 * could plausibly carry it, and otherwise the loop stops and says so honestly.
 *
 * WHY THIS CANNOT RUN AWAY WITH THE USER'S MONEY. Two independent bounds, both
 * evidence rather than taste:
 *   - the wall clock: every attempt consumes real time from one turn deadline,
 *     so the arithmetic caps the climb on its own;
 *   - the catalogue: an engine is worth one shot per turn, so a finite catalogue
 *     is a finite ladder even if failures return instantly. That second bound is
 *     what makes an instant-failure loop impossible rather than merely unlikely.
 */

/**
 * The smallest window in which an attempt could plausibly produce anything.
 * Below this the loop stops instead of starting work it knows cannot land.
 */
export const MIN_VIABLE_ATTEMPT_MS = 20_000;

/** A same-engine repair (behavioral: strengthened brief) is worth one extra
 *  rung beyond the catalogue, because the fix there is the instruction rather
 *  than the route. */
const SAME_ENGINE_REPAIR_RUNGS = 1;

/**
 * How many attempts this turn may still afford, from the two real bounds.
 *
 * @param {object} input
 * @param {number} input.elapsedMs        time already spent on this turn
 * @param {number} input.turnDeadlineMs   the whole turn's wall clock
 * @param {number} input.engineCount      engines available to this turn (the live
 *                                        catalogue, not a guess)
 * @param {number} [input.minViableAttemptMs]
 */
export function planTurnEscalation({
  elapsedMs = 0,
  turnDeadlineMs = 0,
  engineCount = 1,
  minViableAttemptMs = MIN_VIABLE_ATTEMPT_MS,
} = {}) {
  const deadline = Number.isFinite(turnDeadlineMs) ? Math.max(0, turnDeadlineMs) : 0;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const viableMs = Math.max(1, minViableAttemptMs);
  const remainingMs = Math.max(0, deadline - elapsed);

  // The wall clock bound: how many viable attempts still fit in what is left.
  const affordable = Math.floor(remainingMs / viableMs);
  // The catalogue bound: one shot per engine, plus the same-engine brief repair.
  const ladder = Math.max(1, Math.floor(engineCount)) + SAME_ENGINE_REPAIR_RUNGS;

  return {
    remainingMs,
    /** Whether a further attempt may START at all (Move 1: no doomed attempt). */
    mayAttempt: remainingMs >= viableMs,
    /** The real budget for the next attempt — what is left, never a padded floor. */
    attemptBudgetMs: remainingMs >= viableMs ? remainingMs : 0,
    /**
     * The evidence-derived attempt ceiling this turn. Replaces the constant 2.
     * Never below 1: a turn always gets its first attempt.
     */
    maxAttempts: Math.max(1, Math.min(affordable, ladder)),
    stopReason: remainingMs >= viableMs ? null : 'budget-spent',
  };
}

/**
 * Whether the loop may run `attempt`, given the ceiling evidence just produced.
 * Kept separate from `resolveTurnRecovery` on purpose: that function decides
 * WHICH repair matches a diagnosis; this one decides whether any further
 * attempt is affordable at all. Mixing the two is how a count came to stand in
 * for a budget in the first place.
 */
export function mayRunAttempt(attempt, plan) {
  if (!plan || plan.mayAttempt !== true) return false;
  return Number(attempt) <= plan.maxAttempts;
}
