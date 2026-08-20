import assert from 'node:assert/strict';
import test from 'node:test';
import { executeToolCall } from './agent-tools.js';

test('public Travel tool seam rejects malformed model arguments before provider execution', async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const result = await executeToolCall('search_hotels', {
    location: 'Bali',
    checkInDate: 'tomorrow',
    checkOutDate: 'next week',
  }, {
    googleMapsApiKey: 'test-key',
    fetchFn,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'INVALID_ARGUMENT');
  assert.equal(calls, 0, 'invalid model output must never reach the provider');
});

test('public Travel tool seam retries a transient read-only Places failure', async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    if (calls === 1) return new Response('temporary', { status: 503 });
    return new Response(JSON.stringify({ places: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const result = await executeToolCall('search_attractions', {
    location: 'Bali',
  }, {
    googleMapsApiKey: 'test-key',
    fetchFn,
    providerPolicy: { maxAttempts: 2, baseDelayMs: 0, timeoutMs: 1_000 },
  });

  assert.equal(result.status, 'success');
  assert.equal(calls, 2);
});

test('transactional Travel calls remain fail-closed at the guarded seam', async () => {
  const result = await executeToolCall('make_reservation', {
    bookingType: 'flight',
    itemId: 'off_test',
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'TRANSACTION_DISABLED');
  assert.equal(result.executed, false);
});
