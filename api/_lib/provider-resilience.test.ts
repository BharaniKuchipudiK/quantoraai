import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderCircuitOpenError,
  ProviderTimeoutError,
  providerFetch,
  resetProviderResilienceState,
  runProviderOperation,
} from './provider-resilience.js';

test('provider fetch retries transient HTTP failures and returns the healthy response', async () => {
  resetProviderResilienceState();
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return calls === 1
      ? new Response('temporary', { status: 503 })
      : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const response = await providerFetch({
    provider: 'test-provider',
    operation: 'read',
    input: 'https://example.test',
    fetchFn,
    policy: { maxAttempts: 2, baseDelayMs: 0 },
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('provider execution deadline bounds a hung SDK call', async () => {
  resetProviderResilienceState();
  await assert.rejects(
    runProviderOperation({
      provider: 'test-provider',
      operation: 'hung-sdk',
      policy: { timeoutMs: 20, maxAttempts: 1, baseDelayMs: 0 },
      execute: async () => new Promise<never>(() => {}),
    }),
    (error: unknown) => error instanceof ProviderTimeoutError,
  );
});

test('circuit opens after repeated failures and blocks the next call without executing it', async () => {
  resetProviderResilienceState();
  let calls = 0;
  const runFailure = () => runProviderOperation({
    provider: 'test-provider',
    operation: 'unstable',
    policy: {
      timeoutMs: 100,
      maxAttempts: 1,
      baseDelayMs: 0,
      circuitFailureThreshold: 2,
      circuitResetMs: 60_000,
    },
    execute: async () => {
      calls += 1;
      throw new Error('provider unavailable');
    },
  });

  await assert.rejects(runFailure(), /provider unavailable/);
  await assert.rejects(runFailure(), /provider unavailable/);
  await assert.rejects(runFailure(), (error: unknown) => error instanceof ProviderCircuitOpenError);
  assert.equal(calls, 2, 'open circuit must fail fast instead of calling the provider again');
});

test('a healthy result resets prior transient failure state', async () => {
  resetProviderResilienceState();
  let calls = 0;
  const result = await runProviderOperation({
    provider: 'test-provider',
    operation: 'recovering',
    policy: { maxAttempts: 2, baseDelayMs: 0, circuitFailureThreshold: 2 },
    execute: async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary');
      return 'ok';
    },
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);

  const second = await runProviderOperation({
    provider: 'test-provider',
    operation: 'recovering',
    policy: { maxAttempts: 1, baseDelayMs: 0, circuitFailureThreshold: 2 },
    execute: async () => 'still-ok',
  });
  assert.equal(second, 'still-ok');
});
