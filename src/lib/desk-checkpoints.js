import { languageForPath } from './vfs-language.js';
/*
 * Desk checkpoints — rewind for the Coding Desk workspace.
 *
 * Every accepted VFS commit already flows through ONE choke point
 * (commitDeskVfs in AiStudio). This module gives that choke point a bounded
 * history of accepted states, so "the AI just wrecked my working site" has an
 * answer that is not "start over". Non-developers get the safety net
 * developers carry as git reflexes.
 *
 * Deliberately pure and in-memory: snapshots live with the open session, not
 * in localStorage — full VFS copies would blow the same storage budget that
 * session-code-budget.js exists to protect. Durable, cross-reload history is
 * a later phase with a server-side home.
 *
 * Restoring is itself rewindable: a restore first records the current state
 * ("before rewind"), so no click here can lose work — the exact property the
 * feature exists to provide.
 */

export const DESK_CHECKPOINT_LIMIT = 20;
// Full-snapshot budget across the history. Beyond it the oldest entries fall
// off; the cap is what makes "snapshot on every commit" safe to leave on.
export const DESK_CHECKPOINT_BYTE_BUDGET = 4_000_000;
const LABEL_MAX = 80;

/** FNV-1a over the sorted path:content pairs — identity, not cryptography. */
export function hashVfsContent(vfs) {
  const source = vfs && typeof vfs === 'object' ? vfs : {};
  let hash = 0x811c9dc5;
  const mix = (text) => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  for (const path of Object.keys(source).sort()) {
    // Whichever shape the caller holds. This read strings only, so a real desk
    // hashed as if it were empty and every comparison built on it was a
    // comparison of two empty trees -- see vfsFileText.
    const body = vfsFileText(source[path]);
    if (body === null) continue;
    mix(path);
    mix('\u0000');
    mix(body);
    mix('\u0001');
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function vfsBytes(vfs) {
  const source = vfs && typeof vfs === 'object' ? vfs : {};
  let total = 0;
  for (const [path, body] of Object.entries(source)) {
    if (typeof body !== 'string') continue;
    total += path.length + body.length;
  }
  return total;
}

/**
 * The text of a desk file, whichever shape it is held in.
 *
 * THE DEFECT THIS EXISTS FOR.
 *
 * The desk stores `{ content, language }` -- studio-file-tree.js will not even
 * list a path whose entry lacks `.content`, and seven modules read it that way.
 * This family read only the bare-string form, so `snapshotVfs` of a real desk
 * returned `{}`, `recordDeskCheckpoint` saw an empty tree and returned the
 * history unchanged, and NO CHECKPOINT WAS EVER RECORDED. The Rewind control
 * renders only when there are checkpoints, so it never appeared.
 *
 * Everything built on that stream inherited it: the delta chain, the durable
 * desk_checkpoints table, and candidate-patch.js -- whose staleness guard
 * hashed `{}` against `{}`, matched every time, and refused nothing. A guard
 * that cannot fail is the thing this repository names as worse than no guard,
 * and it shipped because every test in the family used string fixtures.
 *
 * Measured on a two-build session before the fix: 1 file on the desk,
 * 0 checkpoints, no Rewind control in the DOM.
 */
export function vfsFileText(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.content === 'string') return entry.content;
  return null;
}

/**
 * Text back into the shape the desk renders.
 *
 * A checkpoint stores text, because that is what a delta and a database column
 * can hold. Installing that text raw would leave every restored file without
 * `.content`, which is the one field the file tree requires -- a rewind that
 * empties the tree it was meant to restore. The language is re-derived from
 * the path, exactly as checkoutFilesToVfs does for an imported repository.
 */
export function deskVfsFromText(files) {
  const vfs = {};
  for (const [path, text] of Object.entries(files && typeof files === 'object' ? files : {})) {
    if (typeof text === 'string') vfs[path] = { content: text, language: languageForPath(path) };
  }
  return vfs;
}

function snapshotVfs(vfs) {
  const copy = {};
  for (const [path, body] of Object.entries(vfs && typeof vfs === 'object' ? vfs : {})) {
    const text = vfsFileText(body);
    if (text !== null) copy[path] = text;
  }
  return Object.freeze(copy);
}

function cleanLabel(label) {
  const value = typeof label === 'string' ? label.trim() : '';
  return value ? value.slice(0, LABEL_MAX) : '';
}

export function createDeskCheckpoint(vfs, meta = {}) {
  const files = snapshotVfs(vfs);
  return Object.freeze({
    id: `ckpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: Number.isFinite(meta.at) ? meta.at : Date.now(),
    label: cleanLabel(meta.label) || 'Workspace change',
    origin: meta.origin === 'restore' || meta.origin === 'baseline' ? meta.origin : 'commit',
    hash: hashVfsContent(files),
    fileCount: Object.keys(files).length,
    bytes: vfsBytes(files),
    vfs: files,
  });
}

function enforceBudget(history) {
  let entries = history.slice(-DESK_CHECKPOINT_LIMIT);
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  // Never drop below the newest entry, whatever its size — a single giant
  // build must still leave one restore point.
  while (entries.length > 1 && total > DESK_CHECKPOINT_BYTE_BUDGET) {
    total -= entries[0].bytes;
    entries = entries.slice(1);
  }
  return entries;
}

/**
 * Append a snapshot of `vfs` unless it is content-identical to the newest
 * entry — a re-render or an unchanged commit must not eat a history slot.
 */
export function recordDeskCheckpoint(history, vfs, meta = {}) {
  const entries = Array.isArray(history) ? history : [];
  const files = snapshotVfs(vfs);
  if (!Object.keys(files).length) return entries;
  const hash = hashVfsContent(files);
  if (entries.length && entries[entries.length - 1].hash === hash) return entries;
  return enforceBudget([...entries, createDeskCheckpoint(files, meta)]);
}

/** Newest-first summaries for the rewind menu; the current state is marked. */
export function describeDeskCheckpoints(history, currentVfs = null) {
  const entries = Array.isArray(history) ? history : [];
  const currentHash = currentVfs ? hashVfsContent(currentVfs) : null;
  return entries
    .slice()
    .reverse()
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      label: entry.label,
      origin: entry.origin,
      fileCount: entry.fileCount,
      bytes: entry.bytes,
      isCurrent: currentHash !== null && entry.hash === currentHash,
    }));
}

/**
 * Plan a rewind. Returns the VFS to install and the next history — which
 * gains a "before rewind" snapshot of the current state when that state is
 * not itself already the newest checkpoint.
 */
export function planDeskRestore(history, checkpointId, currentVfs) {
  const entries = Array.isArray(history) ? history : [];
  const target = entries.find((entry) => entry.id === checkpointId);
  if (!target) return { ok: false, reason: 'not_found' };
  if (currentVfs && hashVfsContent(currentVfs) === target.hash) {
    return { ok: false, reason: 'already_current' };
  }

  const preserved = recordDeskCheckpoint(entries, currentVfs, {
    label: 'Before rewind',
    origin: 'restore',
  });
  // In the desk's own shape, or the file tree shows nothing after a rewind.
  return { ok: true, vfs: deskVfsFromText(target.vfs), history: preserved, restoredLabel: target.label };
}
