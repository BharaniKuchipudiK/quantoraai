/**
 * The working indicator has to point at the chat that is really working.
 *
 * The case that matters is the one nobody tests by hand: a turn started in
 * chat A, the user navigates to chat B, and the turn finishes. The reply lands
 * in A (React closures see to that). If the busy state is cleared for whatever
 * is on screen instead of for the session that owned the turn, A spins for ever
 * and B goes quiet while it is still working — two wrong answers from one
 * mistake, and neither raises an error.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anySessionWorking,
  endSessionWork,
  firstWorkingSession,
  isSessionWorking,
  sendBlockedReason,
  sessionActivityLabel,
  startSessionWork,
} from './session-activity.js';

test('a turn that ends after the user navigated away clears the chat it started in', () => {
  let working = startSessionWork(new Set(), 'chat-a');
  // The user is now reading chat B. The turn belongs to A regardless.
  working = endSessionWork(working, 'chat-a');

  assert.equal(isSessionWorking(working, 'chat-a'), false, 'chat A would spin for ever');
  assert.equal(isSessionWorking(working, 'chat-b'), false, 'chat B was never working');
});

test('ending the WRONG session leaves the real one working, and is refused', () => {
  // Guards the inverse mistake: clearing by "whatever is active now".
  let working = startSessionWork(new Set(), 'chat-a');
  working = endSessionWork(working, 'chat-b');
  assert.equal(isSessionWorking(working, 'chat-a'), true, 'the working chat must not be cleared by another chat finishing');
});

test('two chats can be marked independently, so the indicator is per chat', () => {
  let working = startSessionWork(new Set(), 'chat-a');
  working = startSessionWork(working, 'chat-b');
  assert.equal(isSessionWorking(working, 'chat-a'), true);
  assert.equal(isSessionWorking(working, 'chat-b'), true);

  working = endSessionWork(working, 'chat-a');
  assert.equal(isSessionWorking(working, 'chat-a'), false);
  assert.equal(isSessionWorking(working, 'chat-b'), true, 'one finishing must not clear the other');
});

test('each write returns a NEW set, or React never re-renders the indicator', () => {
  const before = new Set();
  const after = startSessionWork(before, 'chat-a');
  assert.notEqual(after, before, 'mutating in place leaves the sidebar stale');
  assert.equal(before.size, 0);

  const ended = endSessionWork(after, 'chat-a');
  assert.notEqual(ended, after);
});

test('a missing session id is ignored rather than marking a phantom chat', () => {
  assert.equal(startSessionWork(new Set(), '').size, 0);
  assert.equal(startSessionWork(new Set(), null).size, 0);
  assert.equal(isSessionWorking(new Set(['a']), null), false);
  assert.equal(isSessionWorking(undefined, 'a'), false);
});

test('ending a session that was never working is a no-op, not a throw', () => {
  const working = endSessionWork(new Set(['a']), 'never-started');
  assert.equal(working.size, 1);
  assert.equal(endSessionWork(undefined, 'a').size, 0);
});

/* ------------------------------------------------------------------ *
 * A refusal has to say why, and where
 * ------------------------------------------------------------------ */

/**
 * The old code was `if (isGenerating) return;` — the send was discarded with no
 * message at all. The user retyped and pressed send again, and watched nothing
 * happen twice. A control that silently ignores you is worse than one that
 * says no.
 */
test('a send refused because ANOTHER chat is busy names that chat', () => {
  const working = startSessionWork(new Set(), 'chat-a');
  const reason = sendBlockedReason(working, 'chat-b', (id) => (id === 'chat-a' ? 'Coffee shop site' : ''));

  assert.match(reason, /Coffee shop site/, 'naming the chat is the difference between an explanation and a bug report');
  assert.match(reason, /one build at a time/);
});

test('an untitled chat still gets an explanation, not an empty name', () => {
  const working = startSessionWork(new Set(), 'chat-a');
  const reason = sendBlockedReason(working, 'chat-b', () => '');
  assert.match(reason, /another chat/i);
  assert.doesNotMatch(reason, /““|""/, 'an empty quoted title reads as a missing string');
});

test('a send refused because THIS chat is busy says so, and offers Stop', () => {
  const working = startSessionWork(new Set(), 'chat-a');
  const reason = sendBlockedReason(working, 'chat-a', () => 'Coffee shop site');
  assert.match(reason, /this chat/i);
  assert.match(reason, /Stop/);
});

test('nothing working means nothing blocks the send', () => {
  assert.equal(sendBlockedReason(new Set(), 'chat-a', () => 'x'), '');
  assert.equal(sendBlockedReason(undefined, 'chat-a'), '');
});

/* ------------------------------------------------------------------ *
 * What the sidebar shows
 * ------------------------------------------------------------------ */

test('the sidebar marks only the working chat', () => {
  const working = startSessionWork(new Set(), 'chat-a');
  assert.equal(sessionActivityLabel(working, 'chat-a'), 'working');
  assert.equal(sessionActivityLabel(working, 'chat-b'), '', 'an idle chat must not be marked');
});

test('helpers report the set honestly', () => {
  assert.equal(anySessionWorking(new Set()), false);
  assert.equal(anySessionWorking(startSessionWork(new Set(), 'a')), true);
  assert.equal(firstWorkingSession(new Set()), null);
  assert.equal(firstWorkingSession(startSessionWork(new Set(), 'a')), 'a');
});
