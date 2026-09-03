/**
 * A build's files land on the chat that started it.
 *
 * The failure this suite exists to prevent has no error message. A background
 * build finishes while you are reading a different chat; its files are written
 * against the desk on screen; and you watch one project quietly grow another
 * project's code. Nothing throws, nothing is logged, and the only way to notice
 * is to recognise a file you never asked for.
 *
 * That is why every test below is about WHICH desk a write reaches, not whether
 * the write works.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deskFor,
  emptyDesk,
  forgetDesk,
  putDesk,
  resolveWriteTarget,
  updateDesk,
} from './session-desks.js';

const withFiles = (paths) => ({
  ...emptyDesk(),
  vfs: Object.fromEntries(paths.map((path) => [path, { content: `// ${path}` }])),
});

/* ------------------------------------------------------------------ *
 * Writes land on the owning chat, never the visible one
 * ------------------------------------------------------------------ */

test('a background build writes to its OWN desk, not the one on screen', () => {
  let desks = putDesk(new Map(), 'chat-a', withFiles(['shop/index.html']));
  desks = putDesk(desks, 'chat-b', withFiles(['calc/index.html']));

  // The turn started in A. The user is now reading B.
  const target = resolveWriteTarget({ desks, owningSessionId: 'chat-a', activeSessionId: 'chat-b' });

  assert.equal(target.ok, true);
  assert.equal(target.sessionId, 'chat-a');
  assert.deepEqual(Object.keys(target.desk.vfs), ['shop/index.html'], 'the baseline must be A, or the diff is nonsense');
  assert.equal(target.isVisible, false, 'a background write must not move the panes under the reader');
});

test('a write with no owner is refused rather than defaulting to the visible chat', () => {
  // Defaulting is how the original bug gets reintroduced by someone in a hurry.
  const desks = putDesk(new Map(), 'chat-a', withFiles(['a.html']));
  const target = resolveWriteTarget({ desks, owningSessionId: null, activeSessionId: 'chat-a' });

  assert.equal(target.ok, false);
  assert.match(target.reason, /must name the session/i);
  assert.match(target.reason, /whichever chat is on screen/i);
});

test('a write for the visible chat is marked visible, so the panes do move', () => {
  const desks = putDesk(new Map(), 'chat-a', withFiles(['a.html']));
  const target = resolveWriteTarget({ desks, owningSessionId: 'chat-a', activeSessionId: 'chat-a' });
  assert.equal(target.isVisible, true);
});

test('writing one desk leaves every other desk untouched', () => {
  let desks = putDesk(new Map(), 'chat-a', withFiles(['a.html']));
  desks = putDesk(desks, 'chat-b', withFiles(['b.html']));

  desks = updateDesk(desks, 'chat-a', { vfs: { 'a.html': { content: 'changed' } } });

  assert.equal(deskFor(desks, 'chat-a').vfs['a.html'].content, 'changed');
  assert.deepEqual(Object.keys(deskFor(desks, 'chat-b').vfs), ['b.html'], "B must not see A's build");
});

/* ------------------------------------------------------------------ *
 * The store itself
 * ------------------------------------------------------------------ */

test('a chat that was never opened reads as an empty desk, not null', () => {
  // Every caller would otherwise need its own null check, and the one that
  // forgets crashes on a background build nobody was watching.
  const desk = deskFor(new Map(), 'never-opened');
  assert.deepEqual(desk.vfs, {});
  assert.equal(desk.buildJob, null);
  assert.deepEqual(desk.review, []);
  assert.equal(deskFor(undefined, 'x').vfs && typeof deskFor(undefined, 'x').vfs, 'object');
});

test('every write returns a NEW Map, or React shows the previous build for ever', () => {
  const before = new Map();
  const after = putDesk(before, 'chat-a', withFiles(['a.html']));
  assert.notEqual(after, before);
  assert.equal(before.size, 0);

  const updated = updateDesk(after, 'chat-a', { patchNote: 'x' });
  assert.notEqual(updated, after);
});

test('a partial update keeps the rest of that desk', () => {
  let desks = putDesk(new Map(), 'chat-a', { ...withFiles(['a.html']), workspaceCode: '<h1>a</h1>' });
  desks = updateDesk(desks, 'chat-a', { patchNote: 'one file could not be applied' });

  const desk = deskFor(desks, 'chat-a');
  assert.equal(desk.patchNote, 'one file could not be applied');
  assert.equal(desk.workspaceCode, '<h1>a</h1>', 'an unrelated field must survive a partial write');
  assert.deepEqual(Object.keys(desk.vfs), ['a.html']);
});

test('a desk is forgotten only on delete — leaving a chat keeps its build', () => {
  // Dropping the desk on navigation would discard the in-flight build the user
  // can still see running in the sidebar.
  let desks = putDesk(new Map(), 'chat-a', withFiles(['a.html']));
  desks = putDesk(desks, 'chat-b', withFiles(['b.html']));

  desks = forgetDesk(desks, 'chat-a');
  assert.equal(desks.has('chat-a'), false);
  assert.equal(desks.has('chat-b'), true);
  assert.deepEqual(Object.keys(deskFor(desks, 'chat-a').vfs), [], 'a forgotten desk reads empty, not stale');
});

test('a missing session id never corrupts the store', () => {
  const desks = putDesk(new Map(), 'chat-a', withFiles(['a.html']));
  assert.equal(putDesk(desks, '', withFiles(['x'])).size, 1);
  assert.equal(updateDesk(desks, null, { patchNote: 'x' }).size, 1);
  assert.equal(forgetDesk(desks, '').size, 1);
});
