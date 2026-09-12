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
  const serverOwned = owns && qirCoding?.serverOwned === true;

  const send = (method, payload) => {
    if (!owns || serverOwned) return false;
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
    /** True when QIR owns this turn's lifecycle. */
    owns,

    /** True only after #709 selects the standalone worker as execution owner. */
    serverOwned,

    /**
     * Compatibility-mode browser model attempt. In server-owned mode this is a
     * deliberate no-op so an old call site cannot accidentally create a second
     * execution owner for the same action.
     */
    beginAttempt: (goal, engineId) => send('beginModelAttempt', [goal || '', engineId || '']),

    /**
     * Submit one durable server-owned Coding action. The adapter binds the desk
     * context before making coding.model runnable. A null result means the
     * submission did not become runnable; callers must not fall through to a
     * browser model request for that same server-owned action.
     */
    submitServerExecution: async (goal, strategy = '') => {
      if (!serverOwned) return null;
      const fn = qirCoding?.submitServerRun;
      if (typeof fn !== 'function') return null;
      try {
        return await fn.call(qirCoding, goal || '', strategy || '');
      } catch {
        return null;
      }
    },

    /**
     * Charge the mission's premium reserve for a compatibility-mode browser
     * escalation that is actually starting. Server-owned model spend belongs
     * to the worker path instead.
     */
    chargePremium: async () => {
      if (!owns || serverOwned) return true;
      const fn = qirCoding?.requestPremiumEscalation;
      if (typeof fn !== 'function') return true;
      try {
        const verdict = await fn.call(qirCoding);
        return verdict?.allowed !== false;
      } catch {
        return true;
      }
    },

    /**
     * Browser provider failures are evidence only in compatibility mode. A
     * server-owned worker records provider/model/tool failure facts itself.
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
