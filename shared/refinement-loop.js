/*
 * The refinement loop — how many more times should we try?
 *
 * WHY THIS EXISTS
 *
 * The desk already detects, diagnoses, repairs and re-verifies. What it did
 * not do is ITERATE: a build that crashed got up to three heal attempts, but a
 * build that merely came out mediocre was improved exactly once and then left
 * alone (`autoJobHealRef` was a one-shot latch). So "it broke" was handled and
 * "it works but it is not good" was not — which is the difference between a
 * platform that delivers an outcome and one the user has to hope about.
 *
 * The latch was not laziness. Unbounded stateless retry is worse than one
 * attempt: each round re-sends the same code and the same complaint, so the
 * model proposes the same fix, and the user pays for it repeatedly. A loop is
 * only safe when two things are true, and this module is both of them:
 *
 *   1. MEMORY — every round is told what previous rounds tried and scored, so
 *      round three is informed rather than identical (`formatAttemptMemory`).
 *   2. A STOPPING RULE that fires on evidence, not on a fixed count alone —
 *      stop when it passed, when nothing actionable is left, when the score
 *      stopped climbing, or when the budget is spent (`planRefinementRound`).
 *
 * Pure and side-effect free: no DOM, no network, no model. The decision to
 * spend another turn of the user's money is exactly the kind of logic that
 * should be unit-testable without spending any.
 */

/** Rounds of repair after the first verification. Four is enough to fix a
 *  handful of real issues and small enough to bound cost and latency. */
export const MAX_REFINEMENT_ROUNDS = 4;

/** A round must beat the best score so far by at least this much to count as
 *  progress. Anything less is noise from a non-deterministic grader. */
export const MIN_SCORE_GAIN = 2;

export const REFINEMENT_STOP = Object.freeze({
  PASSED: 'passed',
  NO_VERIFICATION: 'no_verification_yet',
  NO_ISSUES: 'no_actionable_issues',
  NO_CHANGE: 'model_returned_no_change',
  PLATEAU: 'no_improvement',
  BUDGET: 'budget_exhausted',
});

function scoreOf(entry) {
  return Number.isFinite(entry?.score) ? entry.score : null;
}

/**
 * Decide whether to spend another refinement round.
 *
 * @param history verification results, oldest first:
 *   [{ score, passed, issues }]. One entry per verification; the number of
 *   repairs already applied is history.length - 1.
 * @param options { maxRounds, minGain, lastRepairChangedNothing }
 * @returns { proceed, reason, round, best }
 */
export function planRefinementRound(history, options = {}) {
  const attempts = Array.isArray(history) ? history.filter(Boolean) : [];
  const maxRounds = Number.isFinite(options.maxRounds) ? options.maxRounds : MAX_REFINEMENT_ROUNDS;
  const minGain = Number.isFinite(options.minGain) ? options.minGain : MIN_SCORE_GAIN;

  const latest = attempts[attempts.length - 1];
  if (!latest) return { proceed: false, reason: REFINEMENT_STOP.NO_VERIFICATION, round: 0, best: null };

  // Already good. Never spend a turn to improve something that passed.
  if (latest.passed === true) {
    return { proceed: false, reason: REFINEMENT_STOP.PASSED, round: attempts.length - 1, best: scoreOf(latest) };
  }

  // A grader that failed something without naming an issue gives the repair
  // model nothing to act on; another round would be a coin flip.
  const issues = Array.isArray(latest.issues) ? latest.issues.filter((i) => typeof i === 'string' && i.trim()) : [];
  if (!issues.length) {
    return { proceed: false, reason: REFINEMENT_STOP.NO_ISSUES, round: attempts.length - 1, best: scoreOf(latest) };
  }

  // The previous repair handed back identical code. Asking again with the same
  // inputs is the definition of a wasted turn.
  if (options.lastRepairChangedNothing === true) {
    return { proceed: false, reason: REFINEMENT_STOP.NO_CHANGE, round: attempts.length - 1, best: scoreOf(latest) };
  }

  const repairsDone = attempts.length - 1;
  if (repairsDone >= maxRounds) {
    return { proceed: false, reason: REFINEMENT_STOP.BUDGET, round: repairsDone, best: bestScore(attempts) };
  }

  /*
   * The must-improve rule. Once a repair has run, the newest score has to beat
   * everything before it by minGain. Without this a loop happily burns its
   * whole budget oscillating around the same score — which is what makes
   * "just retry more" a worse product than a single attempt.
   */
  if (attempts.length >= 2) {
    const previousBest = bestScore(attempts.slice(0, -1));
    const current = scoreOf(latest);
    if (previousBest !== null && current !== null && current - previousBest < minGain) {
      return { proceed: false, reason: REFINEMENT_STOP.PLATEAU, round: repairsDone, best: Math.max(previousBest, current) };
    }
  }

  return { proceed: true, reason: null, round: repairsDone + 1, best: bestScore(attempts) };
}

export function bestScore(history) {
  const scores = (Array.isArray(history) ? history : []).map(scoreOf).filter((s) => s !== null);
  return scores.length ? Math.max(...scores) : null;
}

/**
 * What the user is told when the loop stops. Never "something went wrong":
 * each stop reason is a different fact about their build, and saying which one
 * is the difference between a platform that reports and one that shrugs.
 */
export function describeRefinementStop(reason, history) {
  const best = bestScore(history);
  const suffix = best === null ? '' : ` Best score reached: ${best}.`;
  switch (reason) {
    case REFINEMENT_STOP.PASSED:
      return 'Quality checks passed.';
    case REFINEMENT_STOP.PLATEAU:
      return `Stopped improving — the last round did not make it better, so further attempts would just cost you time.${suffix}`;
    case REFINEMENT_STOP.BUDGET:
      return `Reached the refinement limit.${suffix} Tell me what to change and I will keep going.`;
    case REFINEMENT_STOP.NO_CHANGE:
      return `The repair returned the page unchanged, so the remaining issues need a different instruction.${suffix}`;
    case REFINEMENT_STOP.NO_ISSUES:
      return `The check flagged the page but named nothing specific to fix.${suffix}`;
    default:
      return '';
  }
}

/**
 * The memory a repair round gets about the ones before it. This is what makes
 * round three different from round one; without it the model re-proposes the
 * fix that already failed.
 */
export function formatAttemptMemory(history, options = {}) {
  const attempts = Array.isArray(history) ? history.filter(Boolean) : [];
  if (attempts.length < 2) return '';
  const maxIssues = Number.isFinite(options.maxIssuesPerRound) ? options.maxIssuesPerRound : 4;

  const lines = ['PREVIOUS ATTEMPTS ON THIS PAGE (do not repeat what did not work):'];
  attempts.forEach((attempt, index) => {
    const score = scoreOf(attempt);
    const label = index === 0 ? 'Initial build' : `After repair ${index}`;
    const issues = (Array.isArray(attempt.issues) ? attempt.issues : [])
      .filter((issue) => typeof issue === 'string' && issue.trim())
      .slice(0, maxIssues);
    lines.push(`- ${label}: score ${score === null ? 'unknown' : score}${issues.length ? ` — still wrong: ${issues.join('; ')}` : ''}`);
  });

  const first = scoreOf(attempts[0]);
  const last = scoreOf(attempts[attempts.length - 1]);
  if (first !== null && last !== null && last <= first) {
    lines.push('- The score has NOT improved since the first build. Change your approach; repeating the previous edit will not help.');
  }
  return lines.join('\n');
}
