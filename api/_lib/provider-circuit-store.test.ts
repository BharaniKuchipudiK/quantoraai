import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SharedProviderCircuitStore,
  degradedCircuitFailureThreshold,
} from './provider-circuit-store.js';

test('degradedCircuitFailureThreshold opens about twice as fast', () => {
  assert.equal(degradedCircuitFailureThreshold(4), 2);
  assert.equal(degradedCircuitFailureThreshold(3), 2);
  assert.equal(degradedCircuitFailureThreshold(2), 1);
  assert.equal(degradedCircuitFailureThreshold(1), 1);
});

test('shared store falls back to local-degraded and opens sooner when remote is down', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

  let now = 1_000;
  const store = new SharedProviderCircuitStore(async () => null, () => now);
  store.resetForTests();

  try {
    const first = await store.recordFailure('gemini:chat', {
      now,
      failureThreshold: 4,
      resetMs: 30_000,
    });
    assert.equal(store.health().mode, 'local-degraded');
    assert.equal(store.health().degraded, true);
    assert.equal(first.failures, 1);
    assert.equal(first.openedUntil, null);

    now = 1_100;
    const second = await store.recordFailure('gemini:chat', {
      now,
      failureThreshold: 4,
      resetMs: 30_000,
    });
    assert.equal(second.failures, 2);
    assert.equal(second.openedUntil, now + 30_000, 'degraded mode should open at threshold/2');
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('shared store uses the normal threshold when remote RPCs succeed', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

  let failures = 0;
  const store = new SharedProviderCircuitStore(async () => {
    failures += 1;
    return new Response(JSON.stringify({
      failures,
      opened_until: null,
      last_failure_at: new Date().toISOString(),
      last_success_at: null,
    }), { status: 200 });
  });
  store.resetForTests();

  try {
    const first = await store.recordFailure('openrouter:chat', {
      now: Date.now(),
      failureThreshold: 4,
      resetMs: 30_000,
    });
    assert.equal(first.failures, 1);
    assert.equal(first.openedUntil, null);
    assert.equal(store.health().mode, 'shared');
    assert.equal(store.health().degraded, false);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
