import assert from 'node:assert/strict';
import test from 'node:test';
import { deferredWriteStillValid, resolveDeskSaveTarget } from './desk-session-ownership.js';

/**
 * The bug, as it was experienced: open a new chat, start typing a brief for a
 * coffee shop website, and the Coding Desk beside you force-opens the
 * scientific calculator from the previous chat, mid-verification.
 *
 * The snapshot save is debounced 400ms and its effect re-runs when the session
 * changes, so a chat switch built a snapshot from the OUTGOING chat's files and
 * wrote it to whichever session was active when the timer fired. The incoming
 * chat then restored it — persisted, not merely displayed, so it survived a
 * reload.
 */

test('a steady session saves its own desk', () => {
  const result = resolveDeskSaveTarget({ activeSessionId: 'chat-a', lastSeenSession: 'chat-a' });
  assert.equal(result.save, true);
  assert.equal(result.nextSeen, 'chat-a');
});

test('INVARIANT: the pass on which the session changes never saves', () => {
  // The files in state are the outgoing chat's. Its own desk was already saved
  // before the switch; the incoming chat has not restored yet. Writing here is
  // exactly how one chat's build lands in another.
  const result = resolveDeskSaveTarget({ activeSessionId: 'chat-b', lastSeenSession: 'chat-a' });
  assert.equal(result.save, false);
  assert.match(result.reason, /session just changed/);
  assert.equal(result.nextSeen, 'chat-b', 'but the saver now belongs to the new session');
});

test('the very first pass of a session does not save', () => {
  // Nothing has been restored yet, so there is nothing of this session's to save.
  assert.equal(resolveDeskSaveTarget({ activeSessionId: 'chat-a', lastSeenSession: null }).save, false);
});

test('saving resumes on the next pass, once the restore has landed', () => {
  const first = resolveDeskSaveTarget({ activeSessionId: 'chat-b', lastSeenSession: 'chat-a' });
  const second = resolveDeskSaveTarget({ activeSessionId: 'chat-b', lastSeenSession: first.nextSeen });
  assert.equal(second.save, true);
});

test('no session, no save', () => {
  assert.equal(resolveDeskSaveTarget({ activeSessionId: null, lastSeenSession: null }).save, false);
  assert.equal(resolveDeskSaveTarget({}).save, false);
});

test('INVARIANT: a deferred write never lands in a chat it was not built for', () => {
  // The session can change inside the 400ms debounce window, which is the other
  // half of the same bug.
  assert.equal(deferredWriteStillValid({ sessionAtBuild: 'chat-a', sessionNow: 'chat-a' }), true);
  assert.equal(deferredWriteStillValid({ sessionAtBuild: 'chat-a', sessionNow: 'chat-b' }), false);
  assert.equal(deferredWriteStillValid({ sessionAtBuild: 'chat-a', sessionNow: null }), false);
  assert.equal(deferredWriteStillValid({ sessionAtBuild: null, sessionNow: null }), false);
  assert.equal(deferredWriteStillValid({}), false);
});

test('the full switch, both guards together', () => {
  // chat-a is building. The user clicks New Chat.
  let seen = 'chat-a';
  const steady = resolveDeskSaveTarget({ activeSessionId: 'chat-a', lastSeenSession: seen });
  assert.equal(steady.save, true, 'chat-a saved its own desk before the switch');

  const onSwitch = resolveDeskSaveTarget({ activeSessionId: 'chat-b', lastSeenSession: seen });
  seen = onSwitch.nextSeen;
  assert.equal(onSwitch.save, false, "chat-a's files are not written into chat-b");

  // And a timer scheduled before the switch, firing after it, is dropped.
  assert.equal(deferredWriteStillValid({ sessionAtBuild: 'chat-a', sessionNow: 'chat-b' }), false);
});
