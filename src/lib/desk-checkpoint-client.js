/*
 * Sending the desk's rewind history somewhere it will survive the tab.
 *
 * The desk holds its checkpoints in memory and is the only holder, so this
 * never disturbs that: it copies the history to the server and reports what
 * happened. The in-memory history is not trimmed, cleared or trusted less
 * because a save succeeded, because the save is a second copy, not a handover.
 *
 * A FAILED SAVE IS RETURNED, NOT SWALLOWED AND NOT THROWN.
 *
 * Thrown, it would break the commit path that called it, and a failure to make
 * a backup must never cost the person the work being backed up. Swallowed, the
 * desk could one day show "history saved" on the strength of nothing. So it
 * comes back as a value the caller may render, ignore, or retry with.
 */

/** Checkpoints beyond which one request would carry more than a request should. */
export const MAX_CHECKPOINTS_PER_SAVE = 40;

/**
 * Copy a desk session's checkpoint history to the server.
 *
 * @param {string} sessionId
 * @param {Array<object>} history  Entries from desk-checkpoints.js.
 * @param {{fetchFn?: typeof fetch}} [options]
 * @returns {Promise<{ok: boolean, saved: number, reason: string}>}
 */
export async function persistDeskCheckpoints(sessionId, history, { fetchFn = null } = {}) {
  const id = typeof sessionId === 'string' ? sessionId.trim() : '';
  const entries = Array.isArray(history) ? history : [];
  if (!id) return { ok: false, saved: 0, reason: 'no desk session to save against' };
  if (!entries.length) return { ok: true, saved: 0, reason: '' };

  const send = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!send) return { ok: false, saved: 0, reason: 'no way to reach the server from here' };

  // Only the newest entries: the tail is what a rewind reaches for, and the
  // server rebuilds a chain from whatever it is given.
  const recent = entries.slice(-MAX_CHECKPOINTS_PER_SAVE);
  try {
    const response = await send('/api/desk-checkpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        sessionId: id,
        history: recent.map((entry) => ({
          id: entry.id,
          at: entry.at,
          label: entry.label,
          origin: entry.origin,
          vfs: entry.vfs,
        })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, saved: 0, reason: data?.error || `the server answered ${response.status}` };
    }
    return { ok: true, saved: Number(data?.saved) || 0, reason: data?.reason || '' };
  } catch (err) {
    return { ok: false, saved: 0, reason: err?.message || 'the save could not be sent' };
  }
}
