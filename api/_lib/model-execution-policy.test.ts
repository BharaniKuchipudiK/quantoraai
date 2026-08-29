import assert from 'node:assert/strict';
import test from 'node:test';
import { isProviderCredentialRejection, shouldFallbackBeforeStreaming, streamErrorFrom } from './model-execution-policy.js';

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

test('a mid-stream provider failure is recognised and carries its upstream status', () => {
  /*
   * A provider can accept the request with HTTP 200 and then fail inside the
   * stream. Both parsers read only choices[0].delta.content, so such an event
   * produced no token and vanished: with no tokens yet the turn blamed the
   * gateway for "an empty response", and with tokens already streamed nothing
   * threw at all - a silently truncated build recorded as outcome:"success",
   * which is the ledger the outcome router later trusts to rank models.
   */
  const credits = streamErrorFrom({ error: { message: 'Insufficient credits', code: 402 } }, 'OpenRouter');
  assert.ok(credits, 'an error event must be recognised');
  assert.match(credits!.message, /Insufficient credits/);
  assert.equal((credits as any).status, 402);
  // The status is the point: it lets the existing classifiers do their job.
  assert.equal(isProviderCredentialRejection(credits), true);

  const rateLimited = streamErrorFrom({ error: { message: 'Rate limited', code: 429 } }, 'OpenRouter');
  assert.equal((rateLimited as any).status, 429);
  assert.equal(isProviderCredentialRejection(rateLimited), false, '429 is retryable, not a credential problem');

  // A bare string error, and an unknown shape, still surface rather than vanish.
  assert.match(streamErrorFrom({ error: 'upstream exploded' }, 'OpenRouter')!.message, /upstream exploded/);
  assert.equal((streamErrorFrom({ error: {} }, 'OpenRouter') as any).status, 502);

  // Ordinary content events must not be mistaken for failures.
  assert.equal(streamErrorFrom({ choices: [{ delta: { content: 'hi' } }] }, 'OpenRouter'), null);
  assert.equal(streamErrorFrom({}, 'OpenRouter'), null);
});
