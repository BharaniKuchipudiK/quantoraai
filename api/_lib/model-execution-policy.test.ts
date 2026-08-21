import assert from 'node:assert/strict';
import test from 'node:test';
import { modelAttemptsForTurn, shouldFallbackBeforeStreaming } from './model-execution-policy.js';

test('a turn never gets more than two model attempts', () => {
  const attempts = modelAttemptsForTurn({
    primaryModelId: 'gemini-3-flash-preview',
    fallbackModelIds: ['openai/gpt-4o-mini', 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct'],
  });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].reason, 'primary');
  assert.equal(attempts[1].reason, 'fallback');
});

test('free Studio routes use the paid emergency route instead of another exhausted free request', () => {
  for (const primaryModelId of [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'poolside/laguna-s-2.1:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
  ]) {
    const attempts = modelAttemptsForTurn({
      primaryModelId,
      fallbackModelIds: ['gemini-flash-latest', 'openai/gpt-oss-20b:free'],
    });
    assert.deepEqual(attempts.map((attempt) => attempt.id), [
      primaryModelId,
      'deepseek/deepseek-chat',
    ]);
    assert.ok(attempts.every((attempt) => attempt.provider === 'openrouter'));
  }
});

test('Travel never falls back to a model that would lose travel tools', () => {
  const attempts = modelAttemptsForTurn({
    primaryModelId: 'gemini-3-flash-preview',
    fallbackModelIds: ['openai/gpt-4o-mini'],
    travelToolsEnabled: true,
  });
  assert.ok(attempts.every((attempt) => attempt.provider === 'gemini'));
  assert.ok(attempts.length <= 2);
});

test('retryable provider failures include endpoint loss and quota exhaustion before streaming', () => {
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('quota exceeded'), { status: 429 })), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('provider endpoint not found'), { status: 404 })), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('bad key'), { status: 401 })), false);
});
