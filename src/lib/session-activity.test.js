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
  MAX_CONCURRENT_TURNS,
  TURN_BUILD,
  TURN_CHAT,
  endSessionWork,
    isSessionWorking,
  sendBlockedReason,
  sessionActivityLabel,
  startSessionWork,
} from './session-activity.js';

test('a turn that ends after the user navigated away clears the chat it started in', () => {
  let working = startSessionWork(new Map(), 'chat-a');
  // The user is now reading chat B. The turn belongs to A regardless.
  working = endSessionWork(working, 'chat-a');

  assert.equal(isSessionWorking(working, 'chat-a'), false, 'chat A would spin for ever');
  assert.equal(isSessionWorking(working, 'chat-b'), false, 'chat B was never working');
});

test('ending the WRONG session leaves the real one working, and is refused', () => {
  // Guards the inverse mistake: clearing by "whatever is active now".
  let working = startSessionWork(new Map(), 'chat-a');
  working = endSessionWork(working, 'chat-b');
  assert.equal(isSessionWorking(working, 'chat-a'), true, 'the working chat must not be cleared by another chat finishing');
});

test('two chats can be marked independently, so the indicator is per chat', () => {
  let working = startSessionWork(new Map(), 'chat-a');
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
  assert.equal(startSessionWork(new Map(), '').size, 0);
  assert.equal(startSessionWork(new Map(), null).size, 0);
  assert.equal(isSessionWorking(new Map([['a', TURN_CHAT]]), null), false);
  assert.equal(isSessionWorking(undefined, 'a'), false);
});

test('ending a session that was never working is a no-op, not a throw', () => {
  const working = endSessionWork(new Map([['a', TURN_CHAT]]), 'never-started');
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
test('a build in ANOTHER chat no longer blocks this one', () => {
  // The whole point of per-session tokens. Before this, working anywhere
  // refused everywhere.
  const working = startSessionWork(new Map(), 'chat-a');
  assert.equal(sendBlockedReason(working, 'chat-b', { titleFor: () => 'Coffee shop site' }), '');
});

test('the studio stops at the concurrency limit, and names what is spending', () => {
  let working = new Map();
  for (let i = 0; i < MAX_CONCURRENT_TURNS; i += 1) working = startSessionWork(working, `chat-${i}`);

  const reason = sendBlockedReason(working, 'chat-new', { titleFor: (id) => `Build ${id}` });
  assert.match(reason, new RegExp(`${MAX_CONCURRENT_TURNS} turns`));
  assert.match(reason, /costs credits/, 'the limit is about money, so it says so');
  assert.match(reason, /Build chat-0/, 'the user has to know which builds to go and stop');
});

test('one below the limit still starts', () => {
  let working = new Map();
  for (let i = 0; i < MAX_CONCURRENT_TURNS - 1; i += 1) working = startSessionWork(working, `chat-${i}`);
  assert.equal(sendBlockedReason(working, 'chat-new', { titleFor: () => 'x' }), '');
});

test('untitled chats at the limit still get an explanation, not empty brackets', () => {
  let working = new Map();
  for (let i = 0; i < MAX_CONCURRENT_TURNS; i += 1) working = startSessionWork(working, `chat-${i}`);
  const reason = sendBlockedReason(working, 'chat-new', { titleFor: () => '' });
  assert.match(reason, /That is the limit/);
  assert.doesNotMatch(reason, /\(\)/, 'empty brackets read as a missing string');
});

test('a send refused because THIS chat is busy says so, and offers Stop', () => {
  const working = startSessionWork(new Map(), 'chat-a');
  const reason = sendBlockedReason(working, 'chat-a', { titleFor: () => 'Coffee shop site' });
  assert.match(reason, /this chat/i);
  assert.match(reason, /Stop/);
});

test('nothing working means nothing blocks the send', () => {
  assert.equal(sendBlockedReason(new Map(), 'chat-a', { titleFor: () => 'x' }), '');
  assert.equal(sendBlockedReason(undefined, 'chat-a'), '');
});

/* ------------------------------------------------------------------ *
 * What the sidebar shows
 * ------------------------------------------------------------------ */

test('the sidebar marks only the working chat', () => {
  const working = startSessionWork(new Map(), 'chat-a');
  assert.equal(sessionActivityLabel(working, 'chat-a'), 'working');
  assert.equal(sessionActivityLabel(working, 'chat-b'), '', 'an idle chat must not be marked');
});

test('helpers report the set honestly', () => {
});

/* ------------------------------------------------------------------ *
 * The desk is one object, so builds stay one at a time
 * ------------------------------------------------------------------ */

/**
 * Two builds may now run at once — and the history of why they could not.
 *
 * This test asserted the opposite until src/lib/session-desks.js landed. `vfs`
 * was a single state swapped as you changed chats, so two builds would each
 * write their files into whichever desk was on screen: one project quietly
 * growing another project's code, with no error anywhere. Refusing was right
 * while that was true.
 *
 * Now every chat owns its desk and every write names the session it belongs to,
 * so the refusal is gone. It is flipped here rather than deleted because the
 * next person to read this needs to know the restriction existed for a reason
 * and what removed it — a rule that vanishes without a trace gets reinvented.
 */
test('two builds run at once, now that each chat owns its desk', () => {
  const working = startSessionWork(new Map(), 'chat-a', TURN_BUILD);
  assert.equal(
    sendBlockedReason(working, 'chat-b', { isBuild: true, titleFor: () => 'Coffee shop site' }),
    '',
    'the desk is no longer shared, so a second build has nothing to collide with',
  );
});

test('a QUESTION runs happily while a build holds the desk', () => {
  // The common case, and the whole point: ask something elsewhere mid-build.
  const working = startSessionWork(new Map(), 'chat-a', TURN_BUILD);
  assert.equal(sendBlockedReason(working, 'chat-b', { isBuild: false, titleFor: () => 'x' }), '');
});

test('a build starts freely when only questions are running', () => {
  let working = startSessionWork(new Map(), 'chat-a', TURN_CHAT);
  working = startSessionWork(working, 'chat-b', TURN_CHAT);
  assert.equal(sendBlockedReason(working, 'chat-c', { isBuild: true, titleFor: () => 'x' }), '');
});


