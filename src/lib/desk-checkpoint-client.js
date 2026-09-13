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

import { hashVfsContent } from './desk-checkpoints.js';
import { hydrateDeskCheckpointHistory } from './desk-checkpoint-delta.js';

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
export async function persistDeskCheckpoints(sessionId, history, { fetchFn = null, expectedRevision = 0 } = {}) {
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
        expectedRevision,
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
      return { ok: false, saved: 0, reason: data?.error || `the server answered ${response.status}`, conflict: response.status === 409 };
    }
    return { ok: true, saved: Number(data?.saved) || 0, reason: data?.reason || '', revision: data?.revision };
  } catch (err) {
    return { ok: false, saved: 0, reason: err?.message || 'the save could not be sent' };
  }
}

/**
 * Read back a desk session's stored rewind history.
 *
 * WHAT IT REFUSES TO DO
 *
 * Returns `entries: null` for anything short of a verified chain: a server that
 * could not be reached, a store that could not be read, or a chain whose
 * replay did not verify. The desk keeps whatever it already has in that case.
 * The one thing this must never do is hand back a partial or unverified
 * history, because the desk would then offer restore points that do not
 * restore what they claim.
 *
 * An empty history is success with nothing in it, and is reported as `[]` --
 * distinct from null, so "this session has no saved history" never renders the
 * same as "we could not find out".
 *
 * @param {string} sessionId
 * @param {{fetchFn?: typeof fetch}} [options]
 * @returns {Promise<{ok: boolean, entries: Array<object>|null, vfs: object|null, reason: string}>}
 */
export async function loadDeskCheckpoints(sessionId, { fetchFn = null } = {}) {
  const id = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!id) return { ok: false, entries: null, vfs: null, reason: 'no desk session to load' };
  const send = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!send) return { ok: false, entries: null, vfs: null, reason: 'no way to reach the server from here' };

  try {
    const response = await send(`/api/desk-checkpoints?sessionId=${encodeURIComponent(id)}`, {
      method: 'GET',
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        entries: null,
        vfs: null,
        reason: data?.error || `the server answered ${response.status}`,
      };
    }
    // Rebuilt and re-verified here, not taken on the server's word.
    const hydrated = hydrateDeskCheckpointHistory(Array.isArray(data?.steps) ? data.steps : []);
    if (!hydrated.ok) return { ok: false, entries: null, vfs: null, reason: hydrated.reason };
    const last = hydrated.entries[hydrated.entries.length - 1] || null;
    return { ok: true, entries: hydrated.entries, vfs: last ? { ...last.vfs } : null, reason: '', revision: data?.revision };
  } catch (err) {
    return { ok: false, entries: null, vfs: null, reason: err?.message || 'the history could not be fetched' };
  }
}


/** One instance per open desk. Conflicts remain blocked until explicit reload. */
export function createDeskCheckpointSaver(sessionId, { save = persistDeskCheckpoints } = {}) {
  let revision = null;
  let anchor = null;
  let blocked = '';
  let pending = Promise.resolve();
  return {
    settle() { return pending; },
    // Only used after the caller preserves local edits and waits for old saves.
    adopt(result) {
      if (!result.ok || !Number.isSafeInteger(result.revision)) return;
      revision = result.revision;
      anchor = result.entries?.at(-1)?.hash || null;
      blocked = '';
    },
    initialize(result) {
      if (!result.ok || !Number.isSafeInteger(result.revision)) return;
      revision = result.revision;
      anchor = result.entries?.at(-1)?.hash || null;
    },
    save(history) {
      const snapshot = JSON.parse(JSON.stringify(history));
      const task = pending.then(async () => {
        if (revision === null) return { ok: false, reason: 'Saved history is still loading. Local files are kept.' };
        if (blocked) return { ok: false, reason: blocked };
        const hashes = snapshot.map((entry) => hashVfsContent(entry.vfs));
        if (anchor && hashes.at(-1) === anchor) return { ok: true, saved: 0 };
        if (anchor && !hashes.includes(anchor)) {
          blocked = 'Saved history changed elsewhere. Local files are kept; reload and reconcile before saving.';
          return { ok: false, reason: blocked };
        }
        const result = await save(sessionId, snapshot, { expectedRevision: revision });
        if (result.ok && Number.isSafeInteger(result.revision)) {
          revision = result.revision;
          anchor = hashes.at(-1);
        } else {
          // A timeout may have committed. Never guess a new revision and retry
          // stale bytes over someone else's work.
          blocked = result.reason || 'Save acknowledgement missing. Local files are kept; reload before saving.';
          return { ...result, ok: false, reason: blocked };
        }
        return result;
      });
      pending = task.catch(() => {});
      return task;
    },
  };
}
