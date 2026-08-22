import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LONG_ADVISOR_USER_TURNS,
  longAdvisorThreadCopy,
  newThreadLabel,
  resolveAdvisorSidebarClick,
  shouldWarnLongAdvisorThread,
} from './advisor-thread.js';

test('Travel starts a new trip, Study starts a new topic, Studio stays New Chat', () => {
  assert.equal(newThreadLabel('travel'), 'New trip');
  assert.equal(newThreadLabel('education'), 'New topic');
  assert.equal(newThreadLabel(null), 'New Chat');
});

test('a long Travel thread warns without wiping the current trip', () => {
  const messages = Array.from({ length: LONG_ADVISOR_USER_TURNS }, (_, index) => ({
    sender: 'user',
    text: `turn ${index + 1}`,
  }));
  assert.equal(shouldWarnLongAdvisorThread({ messages, domain: 'travel' }), true);
  const copy = longAdvisorThreadCopy('travel');
  assert.match(copy.now, /getting long/i);
  assert.match(copy.next, /stays in your list/i);
  assert.equal(copy.action, 'New trip');
});

test('short Travel and website Studio do not show the long-thread warning', () => {
  assert.equal(shouldWarnLongAdvisorThread({
    messages: [{ sender: 'user', text: 'Tokyo in April' }],
    domain: 'travel',
  }), false);
  assert.equal(shouldWarnLongAdvisorThread({
    messages: Array.from({ length: LONG_ADVISOR_USER_TURNS }, () => ({ sender: 'user', text: 'build' })),
    domain: null,
  }), false);
});

test('clicking Travel again stays on the current trip', () => {
  assert.deepEqual(resolveAdvisorSidebarClick({
    currentDomain: 'travel',
    requestedDomain: 'travel',
    sessions: [{ id: 'a', studioDomain: 'travel' }],
    activeSessionId: 'a',
  }), { type: 'stay' });
});

test('clicking Study resumes the last Study thread instead of starting a blank one', () => {
  const decision = resolveAdvisorSidebarClick({
    currentDomain: 'travel',
    requestedDomain: 'education',
    activeSessionId: 'tokyo',
    projectId: 'p1',
    sessions: [
      { id: 'old-study', studioDomain: 'education', projectId: 'p1', updatedAt: 1 },
      { id: 'latest-study', studioDomain: 'education', projectId: 'p1', updatedAt: 9 },
      { id: 'tokyo', studioDomain: 'travel', projectId: 'p1', updatedAt: 8 },
    ],
  });
  assert.deepEqual(decision, { type: 'switch', sessionId: 'latest-study' });
});
