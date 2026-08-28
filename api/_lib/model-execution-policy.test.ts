import assert from 'node:assert/strict';
import test from 'node:test';
import { modelAttemptsForTurn, isProviderCredentialRejection, shouldFallbackBeforeStreaming } from './model-execution-policy.js';

test('a turn keeps trying past the first fallback, but stays bounded', () => {
  // Two attempts meant one free-quota 429 plus one unlucky fallback ended the
  // turn with "the model is busy" while healthy routes sat unused.
  const attempts = modelAttemptsForTurn({
    primaryModelId: 'gemini-3-flash-preview',
    fallbackModelIds: ['openai/gpt-4o-mini', 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct'],
  });
  assert.ok(attempts.length > 2, 'a turn must try more than two models when more are available');
  assert.ok(attempts.length <= 4, 'but the ladder stays bounded so one turn cannot storm a provider');
  assert.equal(attempts[0].reason, 'primary');
  assert.ok(attempts.slice(1).every((attempt) => attempt.reason === 'fallback'));
  assert.equal(new Set(attempts.map((a) => a.id)).size, attempts.length, 'no model is tried twice');
});

test('free Studio routes fail over to Gemini before another OpenRouter model', () => {
  for (const primaryModelId of [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'poolside/laguna-s-2.1:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'qwen/qwen-2.5-coder-32b-instruct',
  ]) {
    const attempts = modelAttemptsForTurn({
      primaryModelId,
      fallbackModelIds: ['deepseek/deepseek-chat', 'openai/gpt-oss-20b:free'],
    });
    // The invariant that matters: the FIRST fallback leaves the shared free
    // OpenRouter quota for the independent Gemini gateway. Later rungs may add
    // same-provider routes, which is fine once the independent one is tried.
    assert.equal(attempts[0].id, primaryModelId);
    assert.equal(attempts[1].id, 'gemini-flash-latest');
    assert.equal(attempts[1].provider, 'gemini');
  }
});

test('Travel never falls back to a model that would lose travel tools', () => {
  const attempts = modelAttemptsForTurn({
    primaryModelId: 'gemini-3-flash-preview',
    fallbackModelIds: ['openai/gpt-4o-mini'],
    travelToolsEnabled: true,
  });
  assert.ok(attempts.every((attempt) => attempt.provider === 'gemini'));
  assert.ok(attempts.length <= 4);
});

test('retryable provider failures include endpoint loss and quota exhaustion before streaming', () => {
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('quota exceeded'), { status: 429 })), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('provider endpoint not found'), { status: 404 })), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('bad key'), { status: 401 })), false);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('credits'), { status: 402 })), false);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('bad key'), { status: 401 }), {
    currentGateway: 'openrouter',
    nextGateway: 'gemini',
  }), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('credits'), { status: 402 }), {
    currentGateway: 'openrouter',
    nextGateway: 'gemini',
  }), true);
});

test('a rejected provider credential is never reported as retryable', () => {
  // The reported failure: the OpenRouter key in the server environment had never
  // been accepted (provider dashboard showed "Last Used: Never"), so every call
  // 401'd — but the user was told to "retry in a moment", which can never work.
  for (const status of [401, 402, 403]) {
    assert.equal(isProviderCredentialRejection({ status }), true, `status ${status}`);
  }
  assert.equal(isProviderCredentialRejection({ message: 'No auth credentials found' }), true);
  assert.equal(isProviderCredentialRejection({ message: 'Invalid API key provided' }), true);

  // Genuinely transient conditions must stay retryable and NOT be called a
  // credential fault, or a rate limit would send the user hunting a good key.
  for (const status of [429, 500, 502, 503, 504]) {
    assert.equal(isProviderCredentialRejection({ status }), false, `status ${status}`);
    assert.equal(shouldFallbackBeforeStreaming({ status }), true, `status ${status} retryable`);
  }
});
