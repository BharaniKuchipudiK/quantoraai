import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStudyLoopState,
  isStudyQuestionCompleted,
  studyQuestionId,
  transitionStudyLoop,
} from './study-conversation-loop.js';

const item = { itemKey: 'motion-slope', prompt: 'What does the slope represent?' };

function reachResolve(correct) {
  const questionId = studyQuestionId(item);
  let state = createStudyLoopState();
  state = transitionStudyLoop(state, { type: 'ASK', questionId });
  state = transitionStudyLoop(state, { type: 'PRESENT', questionId });
  state = transitionStudyLoop(state, { type: 'ATTEMPT', answer: 'Velocity' });
  state = transitionStudyLoop(state, { type: 'VERIFY' });
  return transitionStudyLoop(state, { type: 'RESOLVE', correct, misconception: !correct });
}

test('Study follows ask → await → attempt → verify → resolve → advance', () => {
  const questionId = studyQuestionId(item);
  let state = createStudyLoopState();
  state = transitionStudyLoop(state, { type: 'ASK', questionId });
  assert.equal(state.phase, 'ask');
  state = transitionStudyLoop(state, { type: 'PRESENT', questionId });
  assert.equal(state.phase, 'awaiting_learner_response');
  state = transitionStudyLoop(state, { type: 'ATTEMPT', answer: 'Velocity' });
  assert.equal(state.phase, 'learner_attempt');
  state = transitionStudyLoop(state, { type: 'VERIFY' });
  assert.equal(state.phase, 'evaluate_verify');
  state = transitionStudyLoop(state, { type: 'RESOLVE', correct: true });
  assert.equal(state.phase, 'resolve');
  state = transitionStudyLoop(state, { type: 'ADVANCE' });
  assert.equal(state.phase, 'advance');
});

test('a correct completed question cannot silently repeat', () => {
  const resolved = reachResolve(true);
  assert.equal(isStudyQuestionCompleted(resolved, item), true);
  const advanced = transitionStudyLoop(resolved, { type: 'ADVANCE' });
  const blocked = transitionStudyLoop(advanced, { type: 'ASK', questionId: studyQuestionId(item) });
  assert.strictEqual(blocked, advanced);
  const retry = transitionStudyLoop(advanced, { type: 'ASK', questionId: studyQuestionId(item), explicitRetry: true });
  assert.equal(retry.phase, 'ask');
});

test('an incorrect attempt resolves with remediation context and remains retryable', () => {
  const resolved = reachResolve(false);
  assert.deepEqual(resolved.outcome, { correct: false, misconception: true });
  assert.equal(isStudyQuestionCompleted(resolved, item), false);
  const retry = transitionStudyLoop(resolved, { type: 'ASK', questionId: studyQuestionId(item), explicitRetry: true });
  assert.equal(retry.phase, 'ask');
});

test('all non-Study domains are exact behavioral no-ops', () => {
  for (const domain of ['finance', 'research', 'travel', 'coding', 'general', null]) {
    const state = createStudyLoopState();
    const result = transitionStudyLoop(state, { type: 'ASK', questionId: 'q1' }, domain);
    assert.strictEqual(result, state);
  }
});

test('completed detection lets the caller suppress a duplicate issued item', () => {
  const resolved = reachResolve(true);
  assert.equal(isStudyQuestionCompleted(resolved, { ...item, prompt: 'wording may vary' }), true);
});
