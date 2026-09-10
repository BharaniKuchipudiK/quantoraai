import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makeStudyContinuityCheckpoint, validateStudyContinuityCheckpoint,
  studyContinuityResumeEvents, readStudyContinuity, saveStudyContinuity,
  clearStudyContinuity, STUDY_CONTINUITY_TTL_MS, STUDY_CONTINUITY_HINT_TTL_MS,
} from './study-session-continuity.js';

const now = Date.parse('2026-09-10T11:00:00Z');
const scope = { accountKey: 'learner@example.test', sessionId: 'chat-a', topic: 'Electric circuitry', now };
const mission = { status: 'active', phase: 'guided_practice', source: 'compass', label: scope.topic, conceptId: 'electricity', conceptKey: 'physics.electricity', actionType: 'guided_repair', durationMinutes: 20, topicAligned: true };
const make = (changes = {}) => makeStudyContinuityCheckpoint({ mission: { ...mission, ...changes }, sessionId: scope.sessionId, now });
function memoryStorage() {
  const data = new Map();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i], getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test('the unfinished lesson round-trips through storage', () => {
  const storage = memoryStorage();
  assert.equal(saveStudyContinuity(storage, scope, make()), true);
  assert.deepEqual(readStudyContinuity(storage, scope), make());
});

test('restoration is account, chat and topic scoped', () => {
  const storage = memoryStorage();
  saveStudyContinuity(storage, scope, make());
  for (const other of [{ accountKey: 'other@example.test' }, { sessionId: 'chat-b' }, { topic: 'Cell membrane' }, { accountKey: '' }, { sessionId: '' }]) {
    assert.equal(readStudyContinuity(storage, { ...scope, ...other }), null);
  }
  assert.ok(readStudyContinuity(storage, scope));
});

test('missing, corrupt, future, expired and unknown-version checkpoints fail closed', () => {
  for (const value of [null, {}, { ...make(), version: 'v999' }, { ...make(), savedAt: now + 1 }, { ...make(), savedAt: -1 }, { ...make(), savedAt: now - STUDY_CONTINUITY_TTL_MS - 1 }]) {
    assert.equal(validateStudyContinuityCheckpoint(value, scope), null);
  }
  assert.equal(validateStudyContinuityCheckpoint(make(), { ...scope, now: NaN }), null);
  const storage = memoryStorage();
  saveStudyContinuity(storage, scope, make());
  storage.setItem(storage.key(0), '{broken');
  assert.equal(readStudyContinuity(storage, scope), null);
});

test('review is downgraded to a fresh check; grades, answers and mastery are not persisted', () => {
  const saved = make({ phase: 'review', verifiedOutcome: 'correct', verifiedAttemptId: 'old-attempt', answer: 'secret', mastery: 1, repairRequired: true });
  assert.equal(saved.phase, 'verified_check');
  for (const field of ['verifiedOutcome', 'verifiedAttemptId', 'answer', 'mastery', 'repairRequired']) assert.equal(field in saved, false);
  const restored = validateStudyContinuityCheckpoint({ ...saved, verifiedOutcome: 'correct', mastery: 1 }, scope);
  assert.equal('mastery' in restored, false);
  assert.equal('verifiedOutcome' in restored, false);
});

test('completed, idle, unaligned and unknown missions cannot become resumable progress', () => {
  for (const changes of [{ status: 'completed' }, { status: 'idle' }, { topicAligned: false }, { phase: 'complete' }, { phase: 'unknown' }, { source: 'unknown' }, { label: '' }]) assert.equal(make(changes), null);
  assert.equal(validateStudyContinuityCheckpoint({ ...make(), phase: 'review' }, scope), null);
});

test('resume only emits progress events, never grades, answers, hints or automatic requests', () => {
  for (const phase of ['explain', 'guided_practice', 'verified_check', 'review']) {
    const events = studyContinuityResumeEvents(make({ phase }), scope);
    assert.ok(events.length);
    assert.ok(events.every((event) => ['START_COMPASS', 'PRACTICE'].includes(event.type)));
    assert.doesNotMatch(JSON.stringify(events), /VERIFIED_RESULT|verifiedAttemptId|verifiedOutcome|fetch|onSend|answer/);
    assert.equal(events[0].recommendation.recommendedActionType, ['review', 'verified_check'].includes(phase) ? 'independent_retrieval' : 'guided_repair');
  }
  assert.deepEqual(studyContinuityResumeEvents(make(), { ...scope, topic: 'Other topic' }), []);
});

test('previous hint use remains an expiring observation, never current working state', () => {
  const saved = makeStudyContinuityCheckpoint({ mission, sessionId: scope.sessionId, now, workingState: { temporary: true, conceptLabel: scope.topic, hintDependence: 'high', mastery: 1 } });
  assert.deepEqual(saved.priorSupport, { hintDependence: 'high', observedAt: now });
  assert.equal(validateStudyContinuityCheckpoint(saved, { ...scope, now: now + STUDY_CONTINUITY_HINT_TTL_MS + 1 }).priorSupport, null);
  assert.equal(makeStudyContinuityCheckpoint({ mission, sessionId: scope.sessionId, now, workingState: { temporary: true, conceptLabel: 'Other topic', hintDependence: 'high' } }).priorSupport, null);
});

test('storage denial and oversized records cannot break the lesson', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(readStudyContinuity(broken, scope), null);
  assert.equal(saveStudyContinuity(broken, scope, make()), false);
  assert.equal(clearStudyContinuity(broken, scope), false);
  const storage = memoryStorage(); saveStudyContinuity(storage, scope, make());
  storage.setItem(storage.key(0), 'x'.repeat(2401));
  assert.equal(readStudyContinuity(storage, scope), null);
});

test('checkpoint count is bounded per account without evicting another account', () => {
  const storage = memoryStorage();
  saveStudyContinuity(storage, { ...scope, accountKey: 'other@example.test' }, make());
  for (let i = 0; i < 20; i += 1) {
    const current = { ...scope, sessionId: `chat-${i}`, now: now + i };
    const saved = makeStudyContinuityCheckpoint({ mission, sessionId: current.sessionId, now: current.now });
    assert.equal(saveStudyContinuity(storage, current, saved), true);
  }
  assert.equal(storage.length, 13);
  assert.ok(readStudyContinuity(storage, { ...scope, accountKey: 'other@example.test' }));
  assert.equal(readStudyContinuity(storage, { ...scope, sessionId: 'chat-0', now: now + 20 }), null);
  assert.ok(readStudyContinuity(storage, { ...scope, sessionId: 'chat-19', now: now + 20 }));
});
