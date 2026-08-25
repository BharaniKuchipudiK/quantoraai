import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeModelId, inferenceAttemptBudgetMs, planInferenceRoutes, summarizeInferenceReadiness } from './inference-control-plane.js';

test('the first attempt keeps its generous slice', () => {
  // The chosen model is the most likely to succeed; squeezing it to make room
  // for fallbacks trades a working build for a faster failure.
  assert.equal(inferenceAttemptBudgetMs(120_000, 2), 65_000);
  assert.equal(inferenceAttemptBudgetMs(120_000, 4), 60_000);
  assert.equal(inferenceAttemptBudgetMs(90_000, 2), 65_000);
  assert.equal(inferenceAttemptBudgetMs(55_000, 1), 55_000);
});

test('a longer ladder never starves a rung and never overruns the turn', () => {
  // Reserving for exactly one more attempt gave the third rung of four 0 ms:
  // the turn would report four tries while two never had a chance to run.
  for (const planned of [2, 3, 4]) {
    let remaining = 120_000;
    for (let left = planned; left >= 1; left -= 1) {
      const slice = inferenceAttemptBudgetMs(remaining, left);
      // Every rung, including the final paid rescue, gets a viable slice when funded.
      assert.ok(slice >= 20_000, `attempt with ${left} left got only ${slice}ms - below viable`);
      remaining -= slice;
    }
    assert.ok(remaining >= 0, `ladder of ${planned} overran the turn budget`);
  }
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
  // More rungs than before, but the invariant that matters is unchanged: the
  // first fallback leaves the failed gateway and quota domain behind.
  assert.ok(routes.length >= 2 && routes.length <= 4, `planned ${routes.length} routes`);
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

test('empty/unhealthy Active list still yields a Gemini last-resort when credentials exist', async () => {
  const routes = await planInferenceRoutes({
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    geminiAvailable: true,
    openRouterAvailable: true,
    models: [
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', available: false, lifecycle: 'offline' },
      { id: 'gemini-flash-latest', available: false, lifecycle: 'unavailable' },
      { id: 'deepseek/deepseek-chat', available: false, health: 'offline' },
    ],
  });
  assert.ok(routes.length >= 1);
  assert.equal(routes[0].id, 'gemini-flash-latest');
  assert.equal(routes[0].gateway, 'gemini');
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

test('a paid rescue rung is held for last, and only when the meter allows', async () => {
  const base = {
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModelIds: ['deepseek/deepseek-chat', 'gemini-flash-latest'],
    geminiAvailable: true,
    openRouterAvailable: true,
    geminiCredentialScope: 'server' as const,
    openRouterCredentialScope: 'server' as const,
  };

  // Not configured: the ladder is exactly as before, all free.
  const noPaid = await planInferenceRoutes(base);
  assert.ok(noPaid.every((route) => route.paid !== true), 'no paid rung without config');

  // Configured but the meter says no: still no paid rung.
  const denied = await planInferenceRoutes({ ...base, paidLastResortModelId: 'anthropic/claude-3.5-sonnet', paidLastResortAllowed: false });
  assert.ok(denied.every((route) => route.paid !== true), 'meter denial keeps paid off');

  // Configured and allowed: paid appears exactly once, as the FINAL rung.
  const allowed = await planInferenceRoutes({ ...base, paidLastResortModelId: 'anthropic/claude-3.5-sonnet', paidLastResortAllowed: true });
  const paidRungs = allowed.filter((route) => route.paid === true);
  assert.equal(paidRungs.length, 1, 'exactly one paid rung');
  assert.equal(allowed[allowed.length - 1].paid, true, 'paid is the last rung');
  assert.notEqual(allowed[0].paid, true, 'the primary is never the paid rung');
  // The free ladder still leads.
  assert.ok(allowed.slice(0, -1).every((route) => route.paid !== true), 'free routes come first');
});

test('canOfferPaidLastResort fails closed', async () => {
  const { canOfferPaidLastResort } = await import('./spend-store.js');
  const paid = 'anthropic/claude-3.5-sonnet';
  // no model configured
  assert.equal(canOfferPaidLastResort({ known: true, monthKey: '2026-08', spentUsd: 0, ceilingUsd: 50, calls: 0 }, ''), false);
  // unreadable ledger
  assert.equal(canOfferPaidLastResort({ known: false, monthKey: '2026-08', spentUsd: 0, ceilingUsd: 50, calls: 0 }, paid), false);
  // no budget
  assert.equal(canOfferPaidLastResort({ known: true, monthKey: '2026-08', spentUsd: 0, ceilingUsd: 0, calls: 0 }, paid), false);
  // ceiling reached
  assert.equal(canOfferPaidLastResort({ known: true, monthKey: '2026-08', spentUsd: 50, ceilingUsd: 50, calls: 9 }, paid), false);
  // headroom + readable + configured => allowed
  assert.equal(canOfferPaidLastResort({ known: true, monthKey: '2026-08', spentUsd: 10, ceilingUsd: 50, calls: 3 }, paid), true);
});
