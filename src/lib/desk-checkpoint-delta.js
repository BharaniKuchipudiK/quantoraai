/*
 * Checkpoints small enough to keep, and a restore that refuses to lie.
 *
 * WHY THIS EXISTS
 *
 * `desk-checkpoints.js` already gives the Coding Desk a rewind history, and it
 * says in its own header what it does not give:
 *
 *   "Deliberately pure and in-memory: snapshots live with the open session...
 *    full VFS copies would blow the same storage budget... Durable,
 *    cross-reload history is a later phase with a server-side home."
 *
 * This is that phase. The obstacle it names is real: twenty full copies of a
 * working tree, per session, per person, is not something to put in a database
 * row. But consecutive checkpoints in a coding session are nearly identical —
 * one file changed, usually one function inside it. Storing what CHANGED
 * instead of what exists turns a four-megabyte history into a few kilobytes,
 * and it is also exactly the shape the rest of Phase 7 needs: a candidate
 * patch is a delta, and a rollback is a delta applied backwards.
 *
 * WHY A CHAIN, AND WHY IT VERIFIES EVERY LINK
 *
 * A delta chain has one failure mode that a pile of full copies does not: one
 * bad link corrupts everything after it. Left unchecked, that returns a
 * working tree that is subtly wrong — some files from one moment, some from
 * another — which is far worse than returning nothing. The person would keep
 * building on it.
 *
 * So every checkpoint carries the hash of the tree it represents, computed by
 * the same `hashVfsContent` the in-memory history already uses, and the replay
 * checks that hash after EVERY step rather than only at the end. A break is
 * therefore located, not merely detected: the caller is told which checkpoint
 * the chain stopped being trustworthy at, and gets the last good tree instead
 * of a plausible-looking mixture.
 *
 * A CHECKPOINT IS WHOLE OR IT IS ABSENT
 *
 * `github-checkout.ts` may return a partial tree because a reading sample is
 * still useful when it says how much it left out. A checkpoint is the opposite
 * kind of thing: it is what someone rewinds to, so a partial one that looks
 * complete is a trap. When a delta will not fit the row budget this module
 * refuses to produce one and says why, and the caller keeps the in-memory
 * snapshot it already had. Nothing is silently truncated.
 */
import { hashVfsContent } from './desk-checkpoints.js';

/**
 * Largest a single stored delta may be, in bytes of file content.
 *
 * Sized so one delta comfortably fits a database row with room for its
 * metadata, while still admitting the honest case of a build that rewrites
 * every file it owns.
 */
export const DELTA_MAX_BYTES = 900_000;

function cleanVfs(vfs) {
  const out = {};
  const source = vfs && typeof vfs === 'object' ? vfs : {};
  for (const path of Object.keys(source)) {
    const body = source[path];
    if (typeof body === 'string') out[path] = body;
  }
  return out;
}

function deltaBytes(delta) {
  let total = 0;
  for (const path of Object.keys(delta.changed)) {
    total += path.length + delta.changed[path].length;
  }
  for (const path of delta.removed) total += path.length;
  return total;
}

/**
 * What changed between two working trees.
 *
 * A rename is an add plus a remove, deliberately: tracking renames would mean
 * guessing which added file "is" which removed one, and a wrong guess restores
 * content under the wrong name. Two honest operations beat one clever one.
 *
 * @param {object|null} previous  The tree the delta is measured FROM (null for a baseline).
 * @param {object} next  The tree the delta must produce.
 * @returns {{changed: Record<string,string>, removed: string[]}}
 */
export function deskVfsDelta(previous, next) {
  const before = cleanVfs(previous);
  const after = cleanVfs(next);
  const changed = {};
  for (const path of Object.keys(after)) {
    if (before[path] !== after[path]) changed[path] = after[path];
  }
  const removed = Object.keys(before).filter((path) => !(path in after)).sort();
  return { changed, removed };
}

/**
 * Apply a delta, producing a new tree. Never mutates its input.
 *
 * @param {object|null} vfs
 * @param {{changed?: Record<string,string>, removed?: string[]}} delta
 * @returns {object}
 */
export function applyDeskVfsDelta(vfs, delta) {
  const out = cleanVfs(vfs);
  const changed = delta && typeof delta.changed === 'object' && delta.changed ? delta.changed : {};
  const removed = Array.isArray(delta?.removed) ? delta.removed : [];
  for (const path of removed) delete out[path];
  for (const path of Object.keys(changed)) {
    const body = changed[path];
    if (typeof body === 'string') out[path] = body;
  }
  return out;
}

/**
 * Whether this delta may be stored.
 *
 * Returns a reason rather than a boolean, because the caller has to tell a
 * person why their history stopped growing, and "too big" without a number is
 * the kind of message that gets ignored until it matters.
 *
 * @returns {{ok: true} | {ok: false, reason: string, bytes: number}}
 */
export function deskDeltaStorable(delta) {
  const bytes = deltaBytes({
    changed: delta?.changed && typeof delta.changed === 'object' ? delta.changed : {},
    removed: Array.isArray(delta?.removed) ? delta.removed : [],
  });
  if (bytes > DELTA_MAX_BYTES) {
    return {
      ok: false,
      bytes,
      reason: `this change is ${Math.round(bytes / 1024)}KB, over the ${Math.round(DELTA_MAX_BYTES / 1024)}KB a stored checkpoint may hold`,
    };
  }
  return { ok: true };
}

/**
 * Rebuild the tree at the end of a chain, checking every link.
 *
 * Each step carries the hash of the tree it is supposed to produce. The hash
 * is checked immediately after that step is applied, so a corrupt or missing
 * row is reported AT the checkpoint that broke rather than as a mysterious
 * mismatch at the end — and the tree handed back is the last one that verified,
 * never a mixture of two moments.
 *
 * @param {{baseline?: object, steps?: Array<{id?: string, delta: object, hash: string}>}} chain
 * @returns {{ok: boolean, vfs: object, verifiedSteps: number, brokeAt: string|null, reason: string}}
 */
export function replayDeskCheckpointChain({ baseline = {}, steps = [] } = {}) {
  let vfs = cleanVfs(baseline);
  let verified = 0;
  const list = Array.isArray(steps) ? steps : [];
  for (const step of list) {
    const next = applyDeskVfsDelta(vfs, step?.delta);
    // The identity is the hex string `hashVfsContent` returns, compared as
    // itself. Coercing it to a number silently turns every hash into NaN and
    // refuses every good chain, which is how this was written the first time.
    const expected = typeof step?.hash === 'string' ? step.hash : '';
    if (!expected) {
      return {
        ok: false,
        vfs,
        verifiedSteps: verified,
        brokeAt: step?.id || null,
        reason: `checkpoint ${step?.id || '(unnamed)'} carries no hash, so nothing can confirm what it restores`,
      };
    }
    if (hashVfsContent(next) !== expected) {
      return {
        ok: false,
        vfs,
        verifiedSteps: verified,
        brokeAt: step?.id || null,
        reason: `checkpoint ${step?.id || '(unnamed)'} does not rebuild to the tree it recorded; `
          + `the chain is broken from here, and the ${verified} checkpoint(s) before it are the last trustworthy state`,
      };
    }
    vfs = next;
    verified += 1;
  }
  return { ok: true, vfs, verifiedSteps: verified, brokeAt: null, reason: '' };
}

/**
 * Turn an in-memory history into the chain that would be stored for it.
 *
 * The first entry is a baseline delta measured from nothing; each later entry
 * is measured from the one before. An entry too large to store stops the chain
 * there and is reported — the chain that comes back is always one that can be
 * replayed in full, never one with a hole in it.
 *
 * @param {Array<{id:string, hash:string, vfs:object, label?:string, at?:number, origin?:string}>} history
 * @returns {{steps: Array<object>, stoppedAt: string|null, reason: string}}
 */
export function planDeskCheckpointChain(history) {
  const entries = Array.isArray(history) ? history : [];
  const steps = [];
  let previous = {};
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string') continue;
    const delta = deskVfsDelta(previous, entry.vfs);
    const storable = deskDeltaStorable(delta);
    if (!storable.ok) {
      return { steps, stoppedAt: entry.id, reason: storable.reason };
    }
    steps.push({
      id: entry.id,
      at: Number.isFinite(entry.at) ? entry.at : null,
      label: typeof entry.label === 'string' ? entry.label : '',
      origin: typeof entry.origin === 'string' ? entry.origin : 'commit',
      hash: hashVfsContent(cleanVfs(entry.vfs)),
      delta,
    });
    previous = cleanVfs(entry.vfs);
  }
  return { steps, stoppedAt: null, reason: '' };
}

/**
 * Turn stored rows back into a replayable chain.
 *
 * A MISSING ROW IS A BREAK, NOT A SHORTER HISTORY.
 *
 * Rows come back from a database, and databases lose rows: a partial write, a
 * retention job, a delete that took one row too many. If this simply sorted
 * what arrived and replayed it, a chain missing its third checkpoint would
 * apply the fourth delta to the second tree — every later hash would then fail,
 * blaming a checkpoint that is perfectly intact while the actual culprit is
 * silently absent. So the sequence is checked for holes first, and the gap is
 * named where it is.
 *
 * @param {Array<{checkpoint_id?:string, seq?:number, label?:string, origin?:string, hash?:string, delta?:object}>} rows
 * @returns {{ok: boolean, steps: Array<object>, reason: string}}
 */
export function deskCheckpointStepsFromRows(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.checkpoint_id === 'string' && Number.isFinite(Number(row.seq)))
    .map((row) => ({
      id: row.checkpoint_id,
      seq: Number(row.seq),
      at: Number.isFinite(Number(row.at)) ? Number(row.at) : null,
      label: typeof row.label === 'string' ? row.label : '',
      origin: typeof row.origin === 'string' ? row.origin : 'commit',
      hash: typeof row.hash === 'string' ? row.hash : '',
      delta: row.delta && typeof row.delta === 'object' ? row.delta : { changed: {}, removed: [] },
    }))
    .sort((a, b) => a.seq - b.seq);

  for (let i = 0; i < list.length; i += 1) {
    if (list[i].seq !== i) {
      return {
        ok: false,
        steps: list.slice(0, i),
        reason: `the stored history jumps from position ${i - 1} to ${list[i].seq}: `
          + `checkpoint ${list[i].id} cannot be rebuilt because the one before it is missing`,
      };
    }
  }
  return { ok: true, steps: list, reason: '' };
}
