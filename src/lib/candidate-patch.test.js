/**
 * A patch applies to the tree it was built against, or to nothing.
 *
 * The failure this object exists for is silent. A model computes an edit
 * against the tree it was shown; seconds or minutes later the desk applies it
 * to whatever the tree is now. Nothing errors. Every file operation succeeds.
 * The result is a tree nobody wrote, and it looks like a normal build.
 *
 * `deferredWriteStillValid` already refuses a deferred write when the SESSION
 * changed under it. These tests are the other half: within one session, the
 * working TREE can move too, and that had nothing guarding it.
 */
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashVfsContent } from './desk-checkpoints.js';
import { applyPatch, patchApplies, proposePatch } from './candidate-patch.js';

const BASE = { 'index.html': '<h1>one</h1>', 'app.css': 'body{}' };
const NEXT = { 'index.html': '<h1>two</h1>', 'app.css': 'body{}', 'new.js': 'added' };

test('a proposal describes the change without making it', () => {
  const before = { ...BASE };
  const patch = proposePatch(before, NEXT, { label: 'Rename the heading' });

  assert.deepEqual(before, BASE, 'proposing must not touch the tree it was given');
  assert.equal(patch.baseHash, hashVfsContent(BASE));
  assert.equal(patch.resultHash, hashVfsContent(NEXT));
  assert.deepEqual(patch.summary.added, ['new.js']);
  assert.deepEqual(patch.summary.changed, ['index.html']);
  assert.deepEqual(patch.summary.removed, []);
  assert.equal(patch.empty, false);
});

test('a proposal that changes nothing says so rather than pretending to be work', () => {
  const patch = proposePatch(BASE, { ...BASE }, { label: 'No-op' });
  assert.equal(patch.empty, true);
  assert.equal(patch.summary.fileCount, 0);
  assert.equal(patch.baseHash, patch.resultHash, 'a change that changes nothing lands on the tree it started from');
});

test('applying produces exactly the tree that was reviewed', () => {
  const patch = proposePatch(BASE, NEXT, { label: 'Rename the heading' });
  const result = applyPatch(patch, BASE);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.vfs, NEXT);
  assert.equal(hashVfsContent(result.vfs), patch.resultHash);
});

/*
 * THE DEFECT THIS WHOLE MODULE IS FOR.
 *
 * The session is the same. The patch is well-formed. Every file operation would
 * succeed. And the tree it was computed against is gone, so applying it writes
 * an edit nobody reviewed over a file that has moved on.
 */
test('a patch is refused once the files have moved on beneath it', () => {
  const patch = proposePatch(BASE, NEXT, { label: 'computed against the old tree' });

  // Anything at all happens in between: a repair lands, a person types.
  const movedOn = { ...BASE, 'index.html': '<h1>edited by hand</h1>' };

  const verdict = patchApplies(patch, movedOn);
  assert.equal(verdict.ok, false, 'a stale patch must not be applicable');
  assert.match(verdict.reason, /no longer exists/);

  const result = applyPatch(patch, movedOn);
  assert.equal(result.ok, false);
  assert.deepEqual(result.vfs, movedOn, 'a refusal leaves the tree exactly as the caller had it');
  assert.match(result.reason, /propose it again/, 'the person needs to know what to do, not only that it failed');
});

test('a patch with no base named is refused rather than trusted', () => {
  const verdict = patchApplies({ delta: { changed: { 'a.js': 'x' }, removed: [] } }, BASE);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /does not say which tree/);
  assert.equal(patchApplies(null, BASE).ok, false);
});

/*
 * Every file operation can succeed and still produce something other than what
 * a person approved. What was reviewed is the outcome, so the outcome is what
 * gets checked.
 */
test('a patch that would land something other than what was reviewed is refused', () => {
  const patch = proposePatch(BASE, NEXT, { label: 'tampered in transit' });
  const tampered = { ...patch, delta: { changed: { 'index.html': '<h1>NOT REVIEWED</h1>' }, removed: [] } };

  const result = applyPatch(tampered, BASE);
  assert.equal(result.ok, false, 'the operations succeeding is not the same as the patch being honoured');
  assert.deepEqual(result.vfs, BASE);
  assert.match(result.reason, /different result from the one that was reviewed/);
});

/*
 * THE GUARD HAS TO BE IN THE PATH, NOT MERELY AVAILABLE TO IT.
 *
 * Everything above exercises the module in isolation, which is exactly the
 * state a complete, tested cost-control subsystem was in when this repository
 * found that nothing called it. A staleness guard that no commit consults
 * passes every test here and protects nothing, so this reads the choke point.
 */
test('the desk commit path consults the guard before accepting a write', () => {
  const source = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.ok(source.length > 5000, `AiStudio.jsx read as ${source.length} bytes; this gate cannot check what it cannot find`);

  assert.match(
    source,
    /const commitDeskVfs = useCallback\(\(nextVfs, owningSessionId = null, \{ baseVfs = null \} = \{\}\)/,
    'commitDeskVfs no longer accepts the tree a caller built from, so nothing can tell whether that tree still exists',
  );
  assert.match(
    source,
    /if \(!patchApplies\(proposed, before\)\.ok\) return false;/,
    'the commit no longer refuses a write whose base tree has moved on',
  );
  assert.match(
    source,
    /if \(!applyPatch\(proposed, before\)\.ok\) return false;/,
    'the commit no longer refuses a write that would land something other than what was built',
  );

  // The guard must sit AFTER the preview-regression check and BEFORE the write.
  const regression = source.indexOf('deskCommitRegressesPreview(before, nextVfs).reject');
  const guard = source.indexOf('patchApplies(proposed, before)');
  const write = source.indexOf('desksRef.current = updateDesk(desksRef.current, target.sessionId');
  assert.ok(regression > 0 && guard > 0 && write > 0, 'all three points must exist');
  assert.ok(guard > regression, 'the staleness guard belongs with the other refusals');
  assert.ok(
    guard < write,
    'a guard that runs after the write has already happened refuses nothing',
  );
});

/*
 * ---------------------------------------------------------------------------
 * THE SHAPE THE DESK ACTUALLY USES, AND WHY EVERY TEST ABOVE MISSED IT.
 *
 * Every case above passes a bare-string VFS. The desk stores
 * `{ content, language }`, and `cleanVfs` used to keep only strings -- so on a
 * real desk it produced `{}`, every hash here ran over that empty object, and
 * `patchApplies` compared hash({}) with hash({}). It matched every time.
 *
 * The guard shipped, was two-way checked, was wired at the choke point, and
 * refused nothing in production. A check that cannot fail is worse than no
 * check, and string fixtures are how this one got past its own gate.
 * ---------------------------------------------------------------------------
 */
const DESK_BASE = {
  'index.html': { content: '<h1>one</h1>', language: 'html' },
  'app.css': { content: 'body{}', language: 'css' },
};
const DESK_NEXT = {
  'index.html': { content: '<h1>two</h1>', language: 'html' },
  'app.css': { content: 'body{}', language: 'css' },
};

test('a desk-shaped tree is seen, not read as empty', () => {
  const patch = proposePatch(DESK_BASE, DESK_NEXT, { label: 'Rename the heading' });
  assert.equal(patch.empty, false, 'a real desk edit was described as changing nothing');
  assert.deepEqual(patch.summary.changed, ['index.html']);
  assert.notEqual(patch.baseHash, patch.resultHash, 'two different desk trees hashed the same');
  assert.notEqual(patch.baseHash, hashVfsContent({}), 'a desk tree hashed as if it were empty');
});

/*
 * THE DEFECT, IN THE SHAPE THAT SHIPS. Same case as the string test above; it
 * is repeated rather than parameterised because this is the one that was
 * failing silently in production.
 */
test('a desk-shaped patch is refused once the files have moved on beneath it', () => {
  const patch = proposePatch(DESK_BASE, DESK_NEXT, { label: 'computed against the old tree' });
  const movedOn = { ...DESK_BASE, 'index.html': { content: '<h1>edited by hand</h1>', language: 'html' } };

  const verdict = patchApplies(patch, movedOn);
  assert.equal(verdict.ok, false, 'a stale patch against the desk\'s real shape was accepted');
  assert.match(verdict.reason, /no longer exists/);
  assert.equal(applyPatch(patch, movedOn).ok, false);
});

test('a desk-shaped patch still applies to the tree it was built against', () => {
  const patch = proposePatch(DESK_BASE, DESK_NEXT, { label: 'Rename the heading' });
  const result = applyPatch(patch, DESK_BASE);
  assert.equal(result.ok, true, result.reason);
  assert.equal(hashVfsContent(result.vfs), patch.resultHash);
});

test('the same content in either shape is the same tree', () => {
  assert.equal(hashVfsContent(DESK_BASE), hashVfsContent(BASE), 'the same files read as two trees depending on how they are held');
  assert.equal(patchApplies(proposePatch(BASE, NEXT, {}), DESK_BASE).ok, true, 'a patch built from text does not fit the identical desk tree');
});

/*
 * ---------------------------------------------------------------------------
 * NOTHING WRITES DESK FILES BY RE-IMPLEMENTING PART OF THE GUARD.
 *
 * The test above reads the choke point and proves the staleness check is in it.
 * This is the other half, and the one a real defect taught: the streaming build
 * path -- the one an ordinary build actually takes -- carried a comment saying
 * "route through the guard" and then INLINED a partial copy of it. It kept the
 * preview-regression check and the review, and dropped what comes after them:
 * recording a checkpoint, the write target, and this module's stale-tree
 * refusal.
 *
 * A copy of two thirds of a guard is the shape of the next silent failure, so
 * the choke point is asserted as the only way in rather than merely as
 * present.
 * ---------------------------------------------------------------------------
 */
test('the streaming build path commits through the shared guard, not a copy of it', () => {
  const source = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.ok(source.length > 5000, `AiStudio.jsx read as ${source.length} bytes; this gate cannot check what it cannot find`);

  // Anchored on the one line unique to this path. `canAutoOpenCodeWorkspace`
  // appears in an unrelated effect first, and anchoring there checked the
  // wrong branch entirely -- caught by this gate failing on correct code.
  const streaming = source.indexOf('setCanvasVfs(finalVfs)');
  assert.ok(streaming > 0, 'the streaming build path is no longer recognisable, so this gate is checking nothing');
  assert.equal(
    source.indexOf('setCanvasVfs(finalVfs)', streaming + 1),
    -1,
    'the anchor is no longer unique, so this gate may be reading a different branch than it thinks',
  );
  // The window is the branch body: enough to contain the commit, not the file.
  const body = source.slice(streaming, streaming + 2000);

  assert.match(
    body,
    /commitDeskVfs\(finalVfs/,
    'the streaming build path no longer commits through commitDeskVfs; a build that bypasses it records no checkpoint, so Rewind disappears and the stale-tree refusal never runs',
  );
  assert.ok(
    !/setVfs\(finalVfs\)/.test(body),
    'the streaming build path installs the tree itself again, which is how it came to skip the checkpoint the first time',
  );
});
