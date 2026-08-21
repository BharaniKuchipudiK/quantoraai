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

test('Travel never falls back to a model that would lose travel tools', () => {
  const attempts = modelAttemptsForTurn({
    primaryModelId: 'gemini-3-flash-preview',
    fallbackModelIds: ['openai/gpt-4o-mini'],
    travelToolsEnabled: true,
  });
  assert.ok(attempts.every((attempt) => attempt.provider === 'gemini'));
  assert.ok(attempts.length <= 2);
});

test('retryable provider failures may fall back only before streaming', () => {
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('high demand'), { status: 503 })), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('bad key'), { status: 401 })), false);
});
