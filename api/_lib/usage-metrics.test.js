import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatedUsageFromText,
  normalizeGeminiUsage,
  normalizeOpenRouterUsage,
  usageOrEstimate,
} from './usage-metrics.js';

test('normalizes OpenRouter native usage without inventing missing fields', () => {
  assert.deepEqual(normalizeOpenRouterUsage({
    prompt_tokens: 120,
    completion_tokens: 35,
    total_tokens: 155,
    completion_tokens_details: { reasoning_tokens: 8 },
    prompt_tokens_details: { cached_tokens: 40 },
    cost: 0.00123,
  }), {
    tokenSource: 'provider',
    inputTokens: 120,
    outputTokens: 35,
    reasoningTokens: 8,
    cachedTokens: 40,
    totalTokens: 155,
    costUsd: 0.00123,
  });
});

test('normalizes Gemini usage metadata', () => {
  assert.deepEqual(normalizeGeminiUsage({
    promptTokenCount: 90,
    candidatesTokenCount: 25,
    thoughtsTokenCount: 5,
    cachedContentTokenCount: 30,
    totalTokenCount: 120,
  }), {
    tokenSource: 'provider',
    inputTokens: 90,
    outputTokens: 25,
    reasoningTokens: 5,
    cachedTokens: 30,
    totalTokens: 120,
    costUsd: null,
  });
});

test('rejects empty provider usage and falls back to an explicit estimate', () => {
  assert.equal(normalizeOpenRouterUsage({}), null);
  assert.equal(normalizeGeminiUsage({}), null);
  assert.deepEqual(usageOrEstimate(null, '12345678'), estimatedUsageFromText('12345678'));
  assert.equal(usageOrEstimate(null, '12345678').totalTokens, 2);
});

test('never accepts negative provider counters or costs', () => {
  assert.equal(normalizeOpenRouterUsage({ prompt_tokens: -1, cost: -2 }), null);
  assert.equal(normalizeGeminiUsage({ totalTokenCount: -1 }), null);
});
