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

test('default free router retries another OpenRouter free model instead of Gemini', () => {
  const attempts = modelAttemptsForTurn({
    primaryModelId: 'openrouter/free',
    fallbackModelIds: ['gemini-flash-latest', 'nvidia/nemotron-3-super-120b-a12b:free'],
  });
  assert.deepEqual(attempts.map((attempt) => attempt.id), [
    'openrouter/free',
    'nvidia/nemotron-3-super-120b-a12b:free',
  ]);
  assert.ok(attempts.every((attempt) => attempt.provider === 'openrouter'));
});

test('live-qualified Nemotron routes fail over to each other before any stale registry candidate', () => {
  const superAttempts = modelAttemptsForTurn({
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModelIds: ['gemini-flash-latest', 'openai/gpt-oss-120b:free'],
  });
  assert.deepEqual(superAttempts.map((attempt) => attempt.id), [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
  ]);

  const ultraAttempts = modelAttemptsForTurn({
    primaryModelId: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    fallbackModelIds: ['gemini-flash-latest'],
  });
  assert.deepEqual(ultraAttempts.map((attempt) => attempt.id), [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
  ]);
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
