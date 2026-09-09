/**
 * When a turn fails, the desk should try to rescue it before asking the person
 * to. The server already decides whether a failure is worth another attempt and
 * streams that as `error.retryable`, and a build-contract failure literally says
 * "retry and I will rebuild" — but nothing on the client ever read either, so
 * every failure ended as a dead message the user had to nurse.
 *
 * Bounded on purpose. Transport failures may still walk the evidence-based
 * engine ladder, but an ARTIFACT-SHAPE failure gets exactly one automatic
 * repair. Re-running the same behavioral repair after it already failed is not
 * escalation; it is the same experiment billed again.
 *
 * THE REPAIR MUST MATCH THE DIAGNOSIS. On 2026-09-01 a boutique build failed
 * BUILD_ARTIFACT_CONTRACT (chat answer, no files), and the retry re-sent the
 * identical prompt to the identical model — which failed identically, because
 * nothing about the attempt had changed. A retry that differs in nothing from
 * the attempt that failed is not a repair; it is the same experiment run twice
 * and billed twice. So each diagnosis now carries its matched repair:
 *
 *   - behavioral failure (the model ignored the artifact contract)
 *       → same engine, ONE STRENGTHENED BRIEF: emit one self-contained HTML
 *         document so the browser and server cannot disagree about the entry.
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

import { mayRunAttempt } from './turn-escalation.js';

export const MAX_TURN_ATTEMPTS = 2;

// Decide at the failure boundary, using the clock NOW, not when the request
// began. Otherwise we announce a retry, erase the answer, then cannot run it.
export function resolveBudgetedTurnRecovery(input, escalation) {
  const attempt = Number(input.attempt) || 1;
  return resolveTurnRecovery({
    ...input,
    maxAttempts: mayRunAttempt(attempt + 1, escalation) ? escalation.maxAttempts : attempt,
  });
}

const RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504]);
const FATAL_STATUS = new Set([401, 402, 403]);

/*
 * A REFUSAL IS NOT A ROUTE FAILURE.
 *
 * 429 sat in RETRYABLE_STATUS above until 2026-09-08, so a rate-limit refusal
 * was diagnosed as a dead route and repaired by switching engines — once per
 * rung. With a ladder of eight, one user message became eight requests in
 * fourteen seconds (observed in a pilot user's Network tab: 8 x 429 on
 * /api/chat, ~2s apart), and the desk narrated each one as
 * "That model route failed. Switching to X".
 *
 * Every property of that was wrong:
 *
 *   - THE DIAGNOSIS. Every 429 the browser can see from /api/chat is one of
 *     Quantora's own three refusals — the per-minute guard, its durable twin,
 *     or the daily turn budget. A provider's own 429 never arrives as one: the
 *     handler converts an upstream quota failure to 503 before replying. So a
 *     429 says "we declined to run this", which no other engine changes.
 *   - THE REPAIR. Each retry spends the very budget it is waiting on, so the
 *     loop inflicts the refusal it is trying to escape. A student on a small
 *     daily budget could lose the whole day to one message.
 *   - THE ACCOUNT. The server sends the honest sentence ("You have used your
 *     N turns for today"), and eight route-failure notices buried it.
 *
 * Checked BEFORE the retryable branch, not merely removed from the set, so a
 * server that one day marks a 429 retryable still cannot restart this loop.
 * The caller shows the server's own message verbatim (responseErrorMessage
 * returns payload.error untouched), which is the whole point: a refusal
 * explains itself, and waiting is the only repair.
 */
const REFUSED_STATUS = new Set([429]);

/**
 * The memory a rebuild attempt carries about the attempt that failed. The
 * repair deliberately collapses to ONE HTML entrypoint. A prior version asked
 * for "html/css/js files" and a model could satisfy those words with CSS alone;
 * the server then saw browser code while Coding Desk had no page to mount.
 */
function buildContractRetryBrief(failureDetail, hasExistingProject = false) {
  const detail = String(failureDetail || '').trim();
  if (hasExistingProject) {
    return 'PREVIOUS ATTEMPT FAILED VERIFICATION'
      + (detail ? `: ${detail}.` : '.')
      + ' This is the ONE automatic artifact repair for this turn.'
      + ' Apply the requested change to the current project. Return corrected file fences or search/replace patches against the provided current source.'
      + ' Preserve unrelated files, behavior and project structure. Do not replace the application with a new self-contained page.';
  }
  return (
    'PREVIOUS ATTEMPT FAILED VERIFICATION'
    + (detail ? `: ${detail}` : '.')
    + ' This is the ONE automatic artifact repair for this turn.'
    + ' Do not answer with prose, a plan, CSS-only, JS-only, or native source.'
    + ' Return EXACTLY one complete self-contained HTML document in a single ```html code fence.'
    + ' Inline the CSS and JavaScript needed for the page so Quantora Preview has one unambiguous runnable entrypoint.'
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
  /**
   * Number of BUILD_ARTIFACT_CONTRACT repairs already started for this turn.
   *
   * Callers that own an explicit per-turn counter should pass it; that keeps a
   * transport failure from consuming the one behavioral repair. The field used
   * to default to 0, though, so an unwired production caller silently received a
   * fresh repair budget on EVERY call. If the counter is omitted we now fail
   * closed from the live attempt number: attempt 1 may repair, later attempts
   * may not. That conservative fallback can withhold a repair after an earlier
   * transport failure, but it can never create an unbounded billed repair loop.
   */
  artifactRepairCount = null,
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
  hasExistingProject = false,
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
  if (REFUSED_STATUS.has(Number(status))) return no('rate-limited');

  // A build artifact gets exactly ONE automatic repair per turn. An explicit
  // counter is authoritative and remains independent from transport attempts.
  // When the caller forgot to wire that state, the attempt number is the
  // conservative backstop: never more than one behavioral repair.
  if (code === 'BUILD_ARTIFACT_CONTRACT') {
    const repairsStarted = artifactRepairCount == null
      ? Math.max(0, Number(attempt) - 1)
      : Math.max(0, Number(artifactRepairCount) || 0);
    if (repairsStarted >= 1) return no('build-repair-exhausted');
    return {
      retry: true,
      switchModel: false,
      retryBrief: buildContractRetryBrief(failureDetail, hasExistingProject),
      notice: hasExistingProject
        ? 'That edit could not be applied. Repairing the change once while keeping the existing project…'
        : 'Those files could not run in Preview. Rebuilding once as a self-contained page…',
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
