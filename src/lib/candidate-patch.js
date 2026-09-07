/*
 * A change the desk proposes, before anyone has agreed to it.
 *
 * WHAT THIS CLOSES
 *
 * Every accepted edit flows through one choke point, and it applies whatever it
 * is handed to whatever the tree happens to be at that moment. The model,
 * though, computed its edit against the tree it was shown, seconds or minutes
 * earlier. Between those two moments a repair can land, a person can type, or
 * another turn can commit.
 *
 * The codebase already knows half of this. `deferredWriteStillValid` refuses a
 * deferred write when the SESSION changed under it, because "a snapshot built
 * for one chat must never land in another". The other half was never guarded:
 * within one chat, a build computed against one working TREE can still land on
 * a different one. The session check passes and the content is stale, which is
 * the quieter failure of the two -- nothing errors, the edit simply applies to
 * a file that has moved on, and the result is a tree nobody wrote.
 *
 * So a patch names the tree it was computed against and is refused against any
 * other. That is the whole point of the object.
 *
 * WHY THE RESULT IS CHECKED TOO
 *
 * A patch is reviewed as an outcome -- this is what the tree will look like --
 * so applying it has to produce that outcome or refuse. A patch that lands
 * something other than what was shown is not the patch that was approved, even
 * when every individual file operation succeeded.
 *
 * WHERE ROLLBACK LIVES, AND WHY IT IS NOT HERE
 *
 * Phase 7 pairs candidate patches with rollback, and it is tempting to add an
 * inverse to this module. The desk already has one: every accepted commit
 * records a checkpoint, and rewind restores a whole verified tree. A per-patch
 * undo would duplicate that for the case they both cover, and an exported
 * inverse with no caller is the defect this repository has paid for before --
 * a complete, tested cost-control subsystem that nothing invoked.
 *
 * Worth recording for whoever does need one: a forward delta says what a file
 * BECOMES, never what it was, and for a deleted file it does not carry what was
 * lost. It cannot be inverted on its own. An inverse has to be captured while
 * the before-tree is still in hand, at the moment of applying.
 *
 * Atomicity comes free from being pure: a refusal returns the caller's own tree
 * untouched, so there is no half-applied state to clean up.
 */
import { hashVfsContent } from './desk-checkpoints.js';
import { applyDeskVfsDelta, deskVfsDelta } from './desk-checkpoint-delta.js';

const LABEL_MAX = 120;

function cleanVfs(vfs) {
  const out = {};
  const source = vfs && typeof vfs === 'object' ? vfs : {};
  for (const path of Object.keys(source)) {
    const body = source[path];
    if (typeof body === 'string') out[path] = body;
  }
  return out;
}

function summarise(before, after) {
  const added = [];
  const changed = [];
  const removed = [];
  for (const path of Object.keys(after)) {
    if (!(path in before)) added.push(path);
    else if (before[path] !== after[path]) changed.push(path);
  }
  for (const path of Object.keys(before)) {
    if (!(path in after)) removed.push(path);
  }
  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
    fileCount: added.length + changed.length + removed.length,
  };
}

/**
 * Describe a change without making it.
 *
 * @param {object} before  The tree the change was computed against.
 * @param {object} after   The tree it is meant to produce.
 * @param {{label?: string, at?: number, id?: string}} [meta]
 * @returns {object} a candidate patch; `empty` is true when nothing would change.
 */
export function proposePatch(before, after, meta = {}) {
  const base = cleanVfs(before);
  const result = cleanVfs(after);
  const label = typeof meta.label === 'string' ? meta.label.trim().slice(0, LABEL_MAX) : '';
  const summary = summarise(base, result);
  return Object.freeze({
    id: typeof meta.id === 'string' && meta.id ? meta.id : `patch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: Number.isFinite(meta.at) ? meta.at : Date.now(),
    label: label || 'Proposed change',
    baseHash: hashVfsContent(base),
    resultHash: hashVfsContent(result),
    delta: deskVfsDelta(base, result),
    summary,
    empty: summary.fileCount === 0,
  });
}

/**
 * Whether this patch may be applied to this tree.
 *
 * Returns a reason rather than a boolean, because a refusal here is shown to a
 * person whose change is not happening, and "cannot apply" without a cause is
 * the kind of message that gets clicked past.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function patchApplies(patch, tree) {
  if (!patch || typeof patch !== 'object') {
    return { ok: false, reason: 'there is no patch to apply' };
  }
  if (typeof patch.baseHash !== 'string' || !patch.baseHash) {
    return { ok: false, reason: 'this patch does not say which tree it was built against, so nothing can confirm it still fits' };
  }
  const actual = hashVfsContent(cleanVfs(tree));
  if (actual !== patch.baseHash) {
    return {
      ok: false,
      reason: 'the files changed after this was proposed, so it was computed against a tree that no longer exists; '
        + 'propose it again against the current files',
    };
  }
  return { ok: true };
}

/**
 * Apply a patch, or refuse and leave the caller's tree exactly as it was.
 *
 * @returns {{ok: true, vfs: object, applied: object} | {ok: false, reason: string, vfs: object}}
 *   `applied` carries the inverse needed to revert, and is what a caller stores.
 */
export function applyPatch(patch, tree) {
  const before = cleanVfs(tree);
  const fits = patchApplies(patch, before);
  if (!fits.ok) return { ok: false, reason: fits.reason, vfs: before };

  const after = applyDeskVfsDelta(before, patch.delta);
  const producedHash = hashVfsContent(after);
  if (producedHash !== patch.resultHash) {
    /*
     * The individual file operations succeeded and produced something other
     * than what was reviewed. Whatever that is, nobody agreed to it.
     */
    return {
      ok: false,
      vfs: before,
      reason: 'applying this produced a different result from the one that was reviewed, so it has not been applied',
    };
  }

  return { ok: true, vfs: after };
}
