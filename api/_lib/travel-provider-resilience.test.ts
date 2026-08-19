import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareTravelConversationRequest,
  TRAVEL_PROVIDER_UNAVAILABLE_CODE,
} from './travel-provider-resilience.js';

test('routes server-owned Travel conversation to independent provider when available', () => {
  const result = prepareTravelConversationRequest(
    {
      studioDomain: 'travel',
      modelId: 'gemini-flash-latest',
      modelName: 'Gemini Flash',
      message: 'Help me plan Bali for 3 nights',
    },
    { openRouterAvailable: true },
  );

  assert.equal(result.kind, 'routed');
  if (result.kind !== 'routed') return;
  assert.equal(result.body.modelId, 'openai/gpt-4o-mini');
  assert.equal(result.body.fallbackFrom, 'gemini-flash-latest');
});

test('fails closed instead of silently returning to Google when independent provider is unavailable', () => {
  const result = prepareTravelConversationRequest(
    {
      studioDomain: 'travel',
      modelId: 'gemini-flash-latest',
      message: 'Help me plan Bali for 3 nights',
    },
    { openRouterAvailable: false },
  );

  assert.equal(result.kind, 'unavailable');
  if (result.kind !== 'unavailable') return;
  assert.equal(result.status, 503);
  assert.equal(result.payload.code, TRAVEL_PROVIDER_UNAVAILABLE_CODE);
  assert.equal(result.payload.retryable, true);
});

test('does not interfere with non-Travel requests', () => {
  const body = { studioDomain: 'research', modelId: 'gemini-flash-latest', message: 'Explain quantum computing' };
  const result = prepareTravelConversationRequest(body, { openRouterAvailable: false });
  assert.equal(result.kind, 'passthrough');
  if (result.kind !== 'passthrough') return;
  assert.equal(result.body, body);
});

test('BYOK Travel requests remain explicit user-owned provider choices', () => {
  const body = {
    studioDomain: 'travel',
    modelId: 'gemini-flash-latest',
    userKey: 'user-owned-key',
    message: 'Help me plan Bali for 3 nights',
  };
  const result = prepareTravelConversationRequest(body, { openRouterAvailable: false });
  assert.equal(result.kind, 'passthrough');
});
