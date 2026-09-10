import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceStudyContinuityHint, requestStudyContinuityHint, subscribeStudyContinuityHints } from './study-continuity-hints.js';
import { makeStudyContinuityCheckpoint, validateStudyContinuityCheckpoint, STUDY_CONTINUITY_HINT_TTL_MS } from './study-session-continuity.js';
test('only a single mounted authenticated owner receives the synchronous click', () => {
  let a = 0; let b = 0;
  assert.equal(requestStudyContinuityHint(), false);
  const offA = subscribeStudyContinuityHints(() => { a++; return true; });
  assert.equal(requestStudyContinuityHint(), true); assert.equal(a, 1);
  const offB = subscribeStudyContinuityHints(() => { b++; return true; });
  assert.equal(requestStudyContinuityHint(), false); assert.equal(b, 0); assert.equal(a, 1);
  offA(); assert.equal(requestStudyContinuityHint(), true); assert.equal(b, 1);
  offB(); assert.equal(requestStudyContinuityHint(), false);
});
test('hint dependence is bounded and resets on chat/topic switch, expiry or future data', () => {
  let state;
  for (let n = 0; n < 20; n++) state = advanceStudyContinuityHint(state, 'account/chat/topic', 1000 + n);
  assert.equal(state.count, 6); assert.equal(state.hintDependence, 'high');
  assert.equal(advanceStudyContinuityHint(state, 'other/chat/topic', 2000).count, 1);
  assert.equal(advanceStudyContinuityHint(state, state.scopeId, 3000000).count, 1);
  assert.equal(advanceStudyContinuityHint(state, state.scopeId, 500).count, 1);
});
test('historical hints expire at the original observation, not at a later lesson save', () => {
  const scope = { sessionId: 'chat', topic: 'Motion graphs', now: 2000 };
  const saved = makeStudyContinuityCheckpoint({ sessionId: scope.sessionId, now: 2000,
    mission: { label: scope.topic, status: 'active', source: 'compass', phase: 'guided_practice', topicAligned: true } });
  saved.priorSupport = { hintDependence: 'high', observedAt: 1000 };
  assert.equal(validateStudyContinuityCheckpoint(saved, scope).priorSupport.observedAt, 1000);
  const later = { ...saved, savedAt: 1000 + STUDY_CONTINUITY_HINT_TTL_MS + 1 };
  assert.equal(validateStudyContinuityCheckpoint(later, { ...scope, now: later.savedAt }).priorSupport, null);
});
