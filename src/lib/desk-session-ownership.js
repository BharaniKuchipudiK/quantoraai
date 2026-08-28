/**
 * A desk belongs to the chat that built it.
 *
 * WHY THIS EXISTS
 *
 * The Coding Desk snapshot is persisted on a 400ms debounce, and the effect
 * that schedules it re-runs when `activeSessionId` changes. So switching to a
 * new chat ran the save with the PREVIOUS chat's files still in state, and
 * wrote them to whichever session was active when the timer fired — the new
 * one. The new chat then restored that snapshot on its next render.
 *
 * What the person saw: they opened a new chat, typed a brief for a coffee shop
 * website, and the desk beside them force-opened the scientific calculator from
 * the chat before, mid-verification. Their work, in somebody else's
 * conversation. And it persisted, because the snapshot was written to the
 * session record rather than merely displayed.
 *
 * THE RULE
 *
 * The files in state belong to the session that was active when they were put
 * there. On the render where the session changes, they belong to the PREVIOUS
 * session and must not be written anywhere — the outgoing chat already saved
 * its own desk before the switch, and the incoming chat has not restored yet.
 */

/**
 * Should this pass persist the desk?
 *
 * @param {object} args
 * @param {string|null} args.activeSessionId  the session now on screen
 * @param {string|null} args.lastSeenSession  the session this saver last ran for
 * @returns {{ save: boolean, nextSeen: string|null, reason: string }}
 */
export function resolveDeskSaveTarget({ activeSessionId = null, lastSeenSession = null } = {}) {
  if (lastSeenSession !== activeSessionId) {
    /*
     * The session changed under us. The files in state are the outgoing chat's,
     * and writing them now is exactly how one chat's build ends up in another.
     * Skip this pass; the restore for the incoming session runs in the same
     * commit, and the next pass sees its files.
     */
    return { save: false, nextSeen: activeSessionId, reason: 'session just changed' };
  }
  if (!activeSessionId) return { save: false, nextSeen: null, reason: 'no active session' };
  return { save: true, nextSeen: activeSessionId, reason: 'files belong to this session' };
}

/**
 * Is this deferred write still valid when it finally fires?
 *
 * The debounce means the session can change during the wait. A snapshot built
 * for one chat must never land in another, however long the timer took.
 */
export function deferredWriteStillValid({ sessionAtBuild = null, sessionNow = null } = {}) {
  return Boolean(sessionAtBuild) && sessionAtBuild === sessionNow;
}
