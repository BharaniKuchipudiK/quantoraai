import test from 'node:test';
import assert from 'node:assert/strict';
import {
  governorEventFromBoundary,
  observeRuntimeLifecycle,
  terminalizeStalledLifecycle,
  type RuntimeGovernorEvent,
} from './runtime-governor.js';

function sink() {
  const events: RuntimeGovernorEvent[] = [];
  return {
    events,
    write: async (event: RuntimeGovernorEvent) => { events.push(event); },
  };
}

test('normal chat lifecycle reaches one verified terminal completion', async () => {
  const out = sink();
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0001', state: 'received', source: 'chat' }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0001', state: 'executing', source: 'chat' }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0001', state: 'validating', source: 'chat' }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0001', state: 'completed', source: 'chat', verified: true }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0001', state: 'failed', source: 'chat' }, out.write);
  assert.deepEqual(out.events.map(event => event.state), ['received', 'executing', 'validating', 'completed']);
  assert.equal(out.events.at(-1)?.terminal, true);
  assert.equal(out.events.at(-1)?.verified, true);
});

test('provider failure may recover before one terminal result', async () => {
  const out = sink();
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0002', state: 'received', source: 'chat' }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0002', state: 'executing', source: 'chat', provider: 'openrouter' }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0002', state: 'recovering', source: 'chat', provider: 'openrouter', recoveryCount: 1 }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0002', state: 'executing', source: 'chat', provider: 'gemini', recoveryCount: 1 }, out.write);
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0002', state: 'completed', source: 'chat', provider: 'gemini', verified: true }, out.write);
  assert.deepEqual(out.events.map(event => event.state), ['received', 'executing', 'recovering', 'executing', 'completed']);
});

test('stalled execution becomes explicit failed terminal outcome', async () => {
  const out = sink();
  await observeRuntimeLifecycle({ correlationId: 'studio-governor-0003', state: 'executing', source: 'chat' }, out.write);
  const terminalized = await terminalizeStalledLifecycle({
    correlationId: 'studio-governor-0003',
    source: 'chat',
    lastObservedAtMs: 1_000,
    nowMs: 11_000,
    staleAfterMs: 5_000,
  }, out.write);
  assert.equal(terminalized, true);
  assert.equal(out.events.at(-1)?.state, 'failed');
  assert.equal(out.events.at(-1)?.reason, 'stalled-without-terminal-outcome');
});

test('telemetry sink outage never breaks the user lifecycle caller', async () => {
  const event = await observeRuntimeLifecycle({
    correlationId: 'studio-governor-0004',
    state: 'received',
    source: 'chat',
  }, async () => { throw new Error('store down'); });
  assert.equal(event?.state, 'received');
});

test('transaction boundary mapping converts provider failure to recovery instead of false terminal failure', () => {
  const event = governorEventFromBoundary({
    correlationId: 'studio-governor-0005',
    boundary: 'inference.provider',
    state: 'failed',
    upstreamProvider: 'openrouter',
    detailCode: 'provider-402',
  });
  assert.equal(event?.state, 'recovering');
  assert.equal(event?.terminal, false);

  const terminal = governorEventFromBoundary({
    correlationId: 'studio-governor-0005',
    boundary: 'api.chat',
    state: 'failed',
    detailCode: 'all-routes-failed',
  });
  assert.equal(terminal?.state, 'failed');
  assert.equal(terminal?.terminal, true);
});
