import assert from 'node:assert/strict';
import test from 'node:test';
import { planInferenceRoutes } from './inference-control-plane.js';

test('selected model remains primary while failover prefers an independent gateway and quota domain', async () => {
  const routes = await planInferenceRoutes({
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModelIds: ['deepseek/deepseek-chat', 'gemini-flash-latest'],
    geminiAvailable: true,
    openRouterAvailable: true,
    geminiCredentialScope: 'server',
    openRouterCredentialScope: 'server',
  });
  assert.equal(routes[0].id, 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(routes[1].gateway, 'gemini');
  assert.notEqual(routes[1].failureDomain, routes[0].failureDomain);
  assert.equal(routes[0].costClass, 'free');
  assert.equal(routes[1].quotaDomain, 'gemini:server');
  assert.equal(routes.length, 2);
});

test('travel tools stay on the only capability-qualified gateway', async () => {
  const routes = await planInferenceRoutes({
    primaryModelId: 'deepseek/deepseek-chat',
    fallbackModelIds: ['gemini-flash-latest'],
    requiredCapabilities: ['text', 'travel-tools'],
    geminiAvailable: true,
    openRouterAvailable: true,
  });
  assert.deepEqual(routes.map((route) => route.id), ['gemini-flash-latest']);
  assert.ok(routes.every((route) => route.capabilities.includes('travel-tools')));
});

test('open circuits and offline registry routes are removed before execution', async () => {
  const now = Date.now();
  const routes = await planInferenceRoutes({
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModelIds: ['deepseek/deepseek-chat', 'gemini-flash-latest'],
    models: [{ id: 'nvidia/nemotron-3-super-120b-a12b:free', available: false }],
    geminiAvailable: true,
    openRouterAvailable: true,
    now,
    circuitStore: {
      async get(key) {
        return key.includes('deepseek')
          ? { failures: 2, openedUntil: now + 60_000, lastFailureAt: now, lastSuccessAt: null }
          : null;
      },
    },
  });
  assert.deepEqual(routes.map((route) => route.id), ['gemini-flash-latest']);
});

test('routes without usable credentials are not planned', async () => {
  const routes = await planInferenceRoutes({
    primaryModelId: 'gemini-flash-latest',
    fallbackModelIds: ['deepseek/deepseek-chat'],
    geminiAvailable: false,
    openRouterAvailable: true,
  });
  assert.deepEqual(routes.map((route) => route.id), ['deepseek/deepseek-chat']);
});
