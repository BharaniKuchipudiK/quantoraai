import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LONG_ADVISOR_USER_TURNS,
  newThreadLabel,
  resolveAdvisorSidebarClick,
} from './advisor-thread.js';

test('Travel starts a new trip, Study starts a new topic, Studio stays New Chat', () => {
  assert.equal(newThreadLabel('travel'), 'New trip');
  assert.equal(newThreadLabel('education'), 'New topic');
  assert.equal(newThreadLabel(null), 'New Chat');
  assert.equal(newThreadLabel(undefined), 'New Chat');
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
