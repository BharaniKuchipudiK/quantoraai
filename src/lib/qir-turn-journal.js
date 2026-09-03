import { codingFailureSpineOwnsTurn } from './build-intent.js';

/*
 * The QIR journal seam for one chat turn.
 *
 * Why this is a module and not three lines inside useChatStream: the ownership
 * decision used to be computed at the call site, so the only thing any gate
 * could check was that the *text* `qirCoding?.beginModelAttempt` still appeared
 * in the hook. That is not a gate (CLAUDE.md §4). It was proved not to be one:
 * rewriting the call site to
 *
 *     const codingSpineOwns = false && codingFailureSpineOwnsTurn({ ... });
 *
 * makes QIR journal nothing for every Coding turn in production — no durable
 * Run, no failure evidence, no resume — and the whole local suite stayed green
 * (1342 pass / 7 fail, byte-identical to the clean tree; the QIR contract test
 * itself passed 4/4 both ways).
 *
 * So ownership is decided HERE, from the raw turn inputs, where a test can drive
 * it with a spy and watch a real call happen or not happen. The call site is
 * reduced to handing over three values it cannot silently weaken.
 *
 * Journalling must never break the user's turn — a dead /api/qir-runs must not
 * take the chat down with it. But "must not throw" is not "may lie": every entry
 * point returns whether it actually journaled, so a caller (and a gate) can tell
 * a suppressed turn from a swallowed error. Returning void here is what let the
 * runtime go dark quietly in the first place.
 */

/**
 * @param {object} input
 * @param {boolean} input.isCodingRequest  turn planner's verdict for this turn
 * @param {string|null} input.studioDomain resolved domain (advisor domains never
 *   own the Coding/Preview failure spine — that was the Study flashcard leak)
 * @param {object|null} input.qirCoding    the useQirCodingRun adapter, or null
 */
export function createQirTurnJournal({
  isCodingRequest = false,
  studioDomain = null,
  qirCoding = null,
} = {}) {
  const owns = codingFailureSpineOwnsTurn({ isCodingRequest, studioDomain });

  const send = (method, payload) => {
    if (!owns) return false;
    const fn = qirCoding?.[method];
    if (typeof fn !== 'function') return false;
    try {
      void fn.call(qirCoding, ...payload);
      return true;
    } catch {
      // The journal is evidence, not control flow. Never let it fail the turn.
      return false;
    }
  };

  return {
    /** True when QIR owns this turn's execution lifecycle. */
    owns,

    /**
     * Open a durable pre-artifact Coding attempt. Called before the model has
     * produced a single byte, which is the whole point: the was-red failure is a
     * provider dying before any runnable file exists.
     * @returns {boolean} whether the attempt was actually journaled
     */
    beginAttempt: (goal, engineId) => send('beginModelAttempt', [goal || '', engineId || '']),

    /**
     * Record failure evidence against the running action.
     *
     * `recoveryExhausted` is the terminal signal: it is the difference between
     * REPLANNING and FAILED_TERMINAL, so it must not be inferred from copy —
     * and it is the MISSION's verdict, not the turn's. A spent turn budget
     * reported here as exhaustion seals the Run for the whole browser session
     * (see mission-continuation.js for the measurement).
     *
     * `engineIds` is what makes the evidence usable rather than merely durable.
     * The field has always existed at the other end of this call — the
     * observation's `ref: model:<id>` — and nothing ever filled it, so the Run
     * recorded that an attempt failed without recording what it failed on.
     * Nothing downstream could then avoid repeating it.
     *
     * It is a LIST because one browser attempt is up to four server ones: the
     * inference ladder in api/_lib/chat-handler.ts works down its own rungs
     * behind a single request, and an engine it burned there is just as spent as
     * one the browser chose. Recording only the browser's primary told the
     * mission the others were still untried.
     *
     * @returns {boolean} whether the failure was actually journaled
     */
    reportFailure: ({ kind, message, engineIds = [], recoveryExhausted = false } = {}) => send('reportModelFailure', [{
      kind,
      message,
      ...(engineIds?.length ? { modelIds: [...engineIds] } : {}),
      retryable: !recoveryExhausted,
      recoveryExhausted,
    }]),
  };
}
