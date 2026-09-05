import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archivedChats,
  chatIsArchived,
  chatIsPinned,
  normalizeChatTitle,
  renameChat,
  setChatArchived,
  toggleChatPinned,
  visibleChats,
} from './chat-organization.js';

const chat = (id, extra = {}) => ({ id, title: id, projectId: 'p1', ...extra });

test('a session written before the flags existed is neither pinned nor archived', () => {
  assert.equal(chatIsPinned({ id: 'a' }), false);
  assert.equal(chatIsArchived({ id: 'a' }), false);
  // Truthy-but-not-true must not count, or a stray string flips a chat out of
  // the list with no way for the person to see why.
  assert.equal(chatIsPinned({ id: 'a', pinned: 'yes' }), false);
  assert.equal(chatIsArchived({ id: 'a', archived: 1 }), false);
});

test('a rename that would blank the row is refused', () => {
  assert.equal(normalizeChatTitle('   '), null);
  assert.equal(normalizeChatTitle(''), null);
  assert.equal(normalizeChatTitle(null), null);
  const sessions = [chat('a')];
  assert.equal(renameChat({ sessions, sessionId: 'a', title: '  ' }).changed, false);
});

test('a rename collapses whitespace and caps the length', () => {
  assert.equal(normalizeChatTitle('  CRM   platform  '), 'CRM platform');
  assert.equal(normalizeChatTitle('x'.repeat(200)).length, 80);
  const result = renameChat({ sessions: [chat('a')], sessionId: 'a', title: 'Sales pipeline' });
  assert.equal(result.changed, true);
  assert.equal(result.sessions[0].title, 'Sales pipeline');
});

test('pinning is a stable partition, not a re-sort', () => {
  const sessions = [chat('a'), chat('b', { pinned: true }), chat('c'), chat('d', { pinned: true })];
  assert.deepEqual(visibleChats(sessions).map((s) => s.id), ['b', 'd', 'a', 'c']);
});

test('toggling a pin is its own undo', () => {
  const once = toggleChatPinned({ sessions: [chat('a')], sessionId: 'a' });
  assert.equal(once.sessions[0].pinned, true);
  const twice = toggleChatPinned({ sessions: once.sessions, sessionId: 'a' });
  assert.equal(twice.sessions[0].pinned, false);
});

test('archived chats leave the list and stay reachable', () => {
  const { sessions } = setChatArchived({ sessions: [chat('a'), chat('b')], sessionId: 'a', archived: true });
  assert.deepEqual(visibleChats(sessions).map((s) => s.id), ['b']);
  assert.deepEqual(archivedChats(sessions).map((s) => s.id), ['a']);
  // The whole point of archive over delete: the same call takes it back.
  const back = setChatArchived({ sessions, sessionId: 'a', archived: false });
  assert.deepEqual(visibleChats(back.sessions).map((s) => s.id), ['a', 'b']);
});

/*
 * The failure this module exists to prevent: archiving the chat you are
 * reading. Without a move, the row vanishes from the nav while its
 * conversation is still on screen and the composer still writes to it.
 */
test('archiving the open chat moves the reader to a real one', () => {
  const result = setChatArchived({
    sessions: [chat('a'), chat('b')],
    sessionId: 'a',
    archived: true,
    activeSessionId: 'a',
    projectId: 'p1',
  });
  assert.equal(result.nextActiveSessionId, 'b');
  assert.equal(result.needsNewChat, false);
});

test('archiving the last chat in a project asks for a replacement', () => {
  const result = setChatArchived({
    sessions: [chat('a')],
    sessionId: 'a',
    archived: true,
    activeSessionId: 'a',
    projectId: 'p1',
  });
  assert.equal(result.nextActiveSessionId, null);
  assert.equal(result.needsNewChat, true);
});

test('archiving a chat you are not reading moves nobody', () => {
  const result = setChatArchived({
    sessions: [chat('a'), chat('b')],
    sessionId: 'b',
    archived: true,
    activeSessionId: 'a',
    projectId: 'p1',
  });
  assert.equal(result.nextActiveSessionId, null);
  assert.equal(result.needsNewChat, false);
});

test('unarchiving never moves the reader', () => {
  const sessions = [chat('a', { archived: true }), chat('b')];
  const result = setChatArchived({
    sessions, sessionId: 'a', archived: false, activeSessionId: 'a', projectId: 'p1',
  });
  assert.equal(result.nextActiveSessionId, null);
  assert.equal(result.needsNewChat, false);
});
