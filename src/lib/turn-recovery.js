/**
 * When a turn fails, the desk should try to rescue it before asking the person
 * to. The server already decides whether a failure is worth another attempt and
 * streams that as `error.retryable`, and a build-contract failure literally says
 * "retry and I will rebuild" — but nothing on the client ever read either, so
 * every failure ended as a dead message the user had to nurse.
 *
 * Bounded on purpose: one extra attempt, never a loop.
 *
 * THE REPAIR MUST MATCH THE DIAGNOSIS. On 2026-09-01 a boutique build failed
 * BUILD_ARTIFACT_CONTRACT (chat answer, no files), and the retry re-sent the
 * identical prompt to the identical model — which failed identically, because
 * nothing about the attempt had changed. A retry that differs in nothing from
 * the attempt that failed is not a repair; it is the same experiment run twice
 * and billed twice. So each diagnosis now carries its matched repair:
 *
 *   - behavioral failure (the model ignored the artifact contract)
 *       → same engine, STRENGTHENED BRIEF: `retryBrief` names what the last
 *         attempt did wrong, so the retry has memory (the same law
 *         shared/refinement-loop.js enforces for artifact repair rounds).
 *   - transport failure (route dead, gateway 5xx, stream dropped)
 *       → same brief, DIFFERENT ENGINE: `switchModel` tells the caller to
 *         re-run on a fallback. The notice names that engine only when the
 *         caller proved one exists — a notice that claims "switching engines"
 *         while re-posting to the same model is a green check over a red log.
 *   - step deadline
 *       → DIFFERENT ENGINE when available + SMALLER EXECUTION SLICE. The 175s
 *         guard is a Step deadline, not permission to dump a Retry button on
 *         the user. One bounded recovery attempt gets a deliberately smaller
 *         brief so it is materially different from the timed-out attempt.
 *
 * src/lib/turn-heal-contract.test.js is the gate on these properties.
 */

export const MAX_TURN_ATTEMPTS = 2;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const FATAL_STATUS = new Set([401, 402, 403]);

/**
 * The memory a rebuild attempt carries about the attempt that failed. Without
 * this the model is asked the identical question and returns the identical
 * chat-only answer — the exact transcript of the 2026-09-01 incident.
 */
function buildContractRetryBrief(failureDetail) {
  const detail = String(failureDetail || '').trim();
  return (
    'PREVIOUS ATTEMPT FAILED VERIFICATION'
    + (detail ? `: ${detail}` : '.')
    + ' Do not answer with prose or a plan. Return the complete files for this build,'
    + ' each in a fenced code block (```html / ```css / ```js) so Preview can run them.'
    + ' A response without code fences will fail again.'
  );
}

function deadlineRecoveryBrief(failureDetail) {
  const detail = String(failureDetail || '').trim();
  return (
    'PREVIOUS EXECUTION STEP HIT ITS DEADLINE'
    + (detail ? `: ${detail}.` : '.')
    + ' Continue the SAME user goal, but reduce this attempt to the smallest independently useful runnable slice.'
    + ' Preserve existing requirements and working files. For a web build, emit one complete runnable page first;'
    + ' do not spend this recovery attempt on commentary, planning, or optional expansion.'
  );
}

export function resolveTurnRecovery({
  attempt = 1,
  /**
   * The evidence-derived ceiling for THIS turn, from `planTurnEscalation`:
   * how many attempts the remaining wall clock and the live engine catalogue
   * can actually fund. Defaults to the old constant so a caller that has not
   * measured anything still gets a bounded loop.
   *
   * This parameter is the whole correction. The standard
   * (docs/engineering/DETECT_DIAGNOSE_VERIFY_APPLY.md) requires the loop to end
   * on "a pass, a plateau, an unchanged repair, or a spent budget, never merely
   * because it tried once" — and a constant 2 is exactly stopping because it
   * tried once. The bound stays; it just gets measured instead of assumed.
   */
  maxAttempts = MAX_TURN_ATTEMPTS,
  status = 0,
  code = '',
  retryable = false,
  hasPartialText = false,
  stoppedByUser = false,
  timedOut = false,
  networkError = false,
  /** What the failed attempt actually did wrong (e.g. the server's public
   *  BUILD_ARTIFACT_CONTRACT sentence). Feeds the retry's memory. */
  failureDetail = '',
  /** Name of the engine the caller can switch to, when it has one. The notice
   *  claims an engine switch only when this is set. */
  fallbackEngineName = null,
} = {}) {
  const no = (reason) => ({ retry: false, resume: false, notice: '', reason });

  if (stoppedByUser) return no('stopped');
  if (Number(attempt) >= Math.max(1, Number(maxAttempts) || MAX_TURN_ATTEMPTS)) return no('attempts-exhausted');

  /*
   * A deadline ends one execution step, not the user's mission. The caller has
   * a bounded second attempt and a minimum recovery slice; use it automatically
   * with a materially different brief instead of making the person tap
   * "Retry a smaller build". This remains bounded by MAX_TURN_ATTEMPTS.
   */
  if (timedOut) {
    return {
      retry: true,
      resume: false,
      switchModel: true,
      retryBrief: deadlineRecoveryBrief(failureDetail),
      notice: fallbackEngineName
        ? `That execution step hit its deadline. Resuming the same goal on ${fallbackEngineName} with a smaller runnable slice…`
        : 'That execution step hit its deadline. Replanning the same goal as a smaller runnable slice…',
      reason: 'step-deadline',
    };
  }

  if (FATAL_STATUS.has(Number(status))) return no('credentials');

  // Chat-only "plans" on Coding Desk often arrive as a full paragraph before
  // we notice there were no fences. Rebuild anyway — Preview/files are the
  // product, not the prose that already rendered. Behavioral failure: keep the
  // engine, strengthen the brief.
  if (code === 'BUILD_ARTIFACT_CONTRACT') {
    return {
      retry: true,
      switchModel: false,
      retryBrief: buildContractRetryBrief(failureDetail),
      notice: 'Those files could not run in Preview. Rebuilding once with stricter instructions…',
      reason: 'build-contract',
    };
  }

  if (code === 'TRAVEL_FLIGHT_PROVIDER') {
    return {
      retry: true,
      notice: 'Live flight lookup failed. Trying the next source once…',
      reason: 'travel-flight',
    };
  }

  /*
   * A half-written answer is worse to RESTART than to keep — the person already
   * read the first paragraph. But "don't restart" was implemented as "stop
   * entirely", which is how a build turn ended as a truncated sentence plus
   * "Quantora could not complete the provider handoff for this turn" and no way
   * forward. Neither restarting nor continuing: just a dead end the user has to
   * nurse by retyping.
   *
   * So a partial answer is now RESUMABLE. The turn is not retried (that would
   * re-run the whole job and duplicate what is already on screen); instead the
   * caller offers a one-tap continuation that carries the partial text forward,
   * which is what "continue as a loop" actually means here.
   */
  if (hasPartialText) return { retry: false, resume: true, notice: '', reason: 'partial-answer' };

  if (retryable === true || RETRYABLE_STATUS.has(Number(status))) {
    // Transport failure: the request was fine, the route was not. Re-running
    // it on the engine that just died is the weakest possible repair, so the
    // caller is told to switch — and the notice only says "switching" when a
    // real fallback engine was offered.
    return {
      retry: true,
      switchModel: true,
      notice: fallbackEngineName
        ? `That model route failed. Switching to ${fallbackEngineName} — same job, not a silent loop…`
        : 'That model route failed. Retrying once — same job, not a silent loop…',
      reason: 'route',
    };
  }

  if (networkError) {
    return {
      retry: true,
      switchModel: true,
      notice: fallbackEngineName
        ? `The connection dropped. Resuming once on ${fallbackEngineName} before we stop and tell you what failed…`
        : 'The connection dropped. Retrying once before we stop and tell you what failed…',
      reason: 'network',
    };
  }

  return no('not-retryable');
}
