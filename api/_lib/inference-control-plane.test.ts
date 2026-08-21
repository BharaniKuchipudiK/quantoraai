import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeModelId, inferenceAttemptBudgetMs, planInferenceRoutes, summarizeInferenceReadiness } from './inference-control-plane.js';

test('build attempt budget reserves time for an independent fallback', () => {
  assert.equal(inferenceAttemptBudgetMs(120_000, 2), 65_000);
  assert.equal(inferenceAttemptBudgetMs(90_000, 2), 45_000);
  assert.equal(inferenceAttemptBudgetMs(55_000, 1), 55_000);
});

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

test('BYOK quota circuits are partitioned without exposing the credential', async () => {
  const [first] = await planInferenceRoutes({
    primaryModelId: 'deepseek/deepseek-chat',
    geminiAvailable: false,
    openRouterAvailable: true,
    openRouterCredentialScope: 'user',
    openRouterCredentialPartition: 'key-a1b2c3',
    requestPartition: 'turn-one',
  });
  const [second] = await planInferenceRoutes({
    primaryModelId: 'deepseek/deepseek-chat',
    geminiAvailable: false,
    openRouterAvailable: true,
    openRouterCredentialScope: 'user',
    openRouterCredentialPartition: 'key-d4e5f6',
    requestPartition: 'turn-two',
  });
  assert.notEqual(first.quotaDomain, second.quotaDomain);
  assert.notEqual(first.domainCircuitKey, second.domainCircuitKey);
  assert.match(first.quotaDomain, /^openrouter:user:key-a1b2c3$/);
});

test('stale Nemotron catalog ids canonicalize onto the live free route', async () => {
  const routes = await planInferenceRoutes({
    primaryModelId: 'nvidia/nemotron-3-super:free',
    geminiAvailable: true,
    openRouterAvailable: true,
  });
  assert.equal(canonicalizeModelId('nvidia/nemotron-3-super:free'), 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(routes[0].id, 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(routes[1].gateway, 'gemini');
});

test('open OpenRouter domain circuits still keep a last-resort executable route', async () => {
  const now = Date.now();
  const routes = await planInferenceRoutes({
    primaryModelId: 'qwen/qwen-2.5-coder-32b-instruct',
    geminiAvailable: false,
    openRouterAvailable: true,
    now,
    circuitStore: {
      async get() {
        return { failures: 8, openedUntil: now + 60_000, lastFailureAt: now, lastSuccessAt: null };
      },
    },
  });
  assert.ok(routes.length >= 1);
  assert.equal(routes[0].gateway, 'openrouter');
});

test('Studio stays executable whenever any inference gateway has credentials', async () => {
  const now = Date.now();
  const openStore = {
    async get() {
      return { failures: 8, openedUntil: now + 60_000, lastFailureAt: now, lastSuccessAt: null };
    },
  };
  const cases = [
    { geminiAvailable: true, openRouterAvailable: true },
    { geminiAvailable: true, openRouterAvailable: false },
    { geminiAvailable: false, openRouterAvailable: true },
    { geminiAvailable: false, openRouterAvailable: true, circuitStore: openStore, now },
    { geminiAvailable: true, openRouterAvailable: true, circuitStore: openStore, now },
  ];
  for (const input of cases) {
    const summary = await summarizeInferenceReadiness(input);
    assert.equal(summary.ready, true, JSON.stringify(input));
    assert.ok(summary.routeCount >= 1);
  }

  const empty = await summarizeInferenceReadiness({ geminiAvailable: false, openRouterAvailable: false });
  assert.equal(empty.ready, false);
  assert.equal(empty.routeCount, 0);
});
