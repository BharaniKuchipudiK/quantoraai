import assert from 'node:assert/strict';
import test from 'node:test';
import { describeQirProviderFailure, qirProviderFailure } from './qir-provider-failure.js';

test('HTTP 402 is preserved as evidence and never rewritten as an empty-balance diagnosis', () => {
  const failure = qirProviderFailure({
    provider: 'openrouter',
    modelId: 'nvidia/nemotron-3.5-lightning:free',
    httpStatus: 402,
    providerCode: 'payment_required',
    providerMessage: 'Request denied by provider policy.',
    retryable: false,
    route: 'openrouter',
  });

  assert.equal(failure.httpStatus, 402);
  assert.equal(failure.providerMessage, 'Request denied by provider policy.');
  const description = describeQirProviderFailure(failure);
  assert.match(description, /HTTP 402/);
  assert.match(description, /Request denied by provider policy/);
  assert.doesNotMatch(description, /insufficient balance|top up|re-issu/i);
});

test('provider failure fields are bounded and malformed statuses are dropped', () => {
  const failure = qirProviderFailure({
    provider: 'x'.repeat(200),
    modelId: 'y'.repeat(400),
    httpStatus: 'not-a-status',
    providerMessage: 'z'.repeat(1000),
    retryable: true,
    fallbackAttempted: true,
  });
  assert.equal(failure.provider.length, 80);
  assert.equal(failure.modelId.length, 200);
  assert.equal(failure.providerMessage.length, 500);
  assert.equal(failure.httpStatus, null);
  assert.equal(failure.retryable, true);
  assert.equal(failure.fallbackAttempted, true);
});
