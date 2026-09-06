import assert from 'node:assert/strict';
import test from 'node:test';
import { BILLING_RESET_MS, canonicalizeModelId, inferenceAttemptBudgetMs, maxViableBuildAttempts, MIN_VIABLE_BUILD_ATTEMPT_MS, planInferenceRoutes, recordInferenceRouteFailure, summarizeInferenceReadiness, trimBuildLadder } from './inference-control-plane.js';

test('the first attempt keeps its generous slice', () => {
  // The chosen model is the most likely to succeed; squeezing it to make room
  // for fallbacks trades a working build for a faster failure. The cap rose from
  // 65s to 110s because a flagship was being cut off part-way through a
  // multi-file build - the tokens were generated and billed, then discarded.
  assert.equal(inferenceAttemptBudgetMs(165_000, 2), 110_000);
  assert.equal(inferenceAttemptBudgetMs(120_000, 2), 100_000);
  assert.equal(inferenceAttemptBudgetMs(120_000, 4), 60_000);
  assert.equal(inferenceAttemptBudgetMs(90_000, 2), 70_000);
  assert.equal(inferenceAttemptBudgetMs(55_000, 1), 55_000);
  // Whatever the split, a rung behind the primary still gets a usable window.
  assert.ok(inferenceAttemptBudgetMs(165_000, 2) <= 165_000 - MIN_VIABLE_BUILD_ATTEMPT_MS);
});

test('a build turn spends its budget on two real attempts, not several cramped ones', () => {
  // Reported as "the connection to the model died before Preview was ready" with
  // real spend on the provider: the flagship generated tokens and was cut at 65s.
  // The function is allowed 180s, only 120s was used, and a third rung was
  // reserved out of the primary's window - so the attempt most likely to succeed
  // had the least time.
  const TOTAL = 165_000;
  const rungs = maxViableBuildAttempts(TOTAL);
  assert.equal(rungs, 2, 'two full-length attempts beat three cramped ones');

  let remaining = TOTAL;
  const slices = [];
  for (let index = 0; index < rungs; index += 1) {
    const slice = inferenceAttemptBudgetMs(remaining, rungs - index, { minAttemptMs: MIN_VIABLE_BUILD_ATTEMPT_MS });
    slices.push(slice);
    remaining -= slice;
  }
  assert.equal(slices[0], 110_000, 'the primary gets a window it can finish a build in');
  assert.ok(slices[1] >= MIN_VIABLE_BUILD_ATTEMPT_MS, 'the fallback is still build-viable');
  assert.ok(slices.reduce((sum, ms) => sum + ms, 0) <= TOTAL, 'the ladder never overruns the turn');
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
  /*
   * The cheap OpenRouter route is always offered alongside whatever was asked
   * for. That is the ladder: a $0.12 route that finishes is worth more than one
   * more attempt at a model the registry has nothing good to say about.
   */
  assert.deepEqual(
    routes.map((route) => route.id),
    ['deepseek/deepseek-chat', 'deepseek/deepseek-v4-flash-0731'],
  );
  assert.ok(routes.every((route) => route.gateway === 'openrouter'), 'no Gemini route without a Gemini credential');
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

/*
 * canOfferPaidLastResort's fail-closed behaviour moved to paid-route-gate,
 * which reads OpenRouter's own meter instead of a ledger nothing wrote to.
 * See paid-route-gate.test.ts: "an unreadable meter is a refusal, never an
 * assumed zero".
 */


test('BUILD budget: the turn never plans a rung too short to finish a build', () => {
  // Why every heavy build ended at the client deadline: a 120s turn split across
  // four rungs handed out 60s/20s/20s/20s. A multi-file page does not come back
  // in 20s on any model, so the primary was cut off mid-file and the three rungs
  // behind it could not finish either — the whole budget went to truncated output
  // and the turn died on the clock. Arithmetic, not model quality.
  const TOTAL = 120_000;
  const ladder = (rungs: number, opts?: { minAttemptMs?: number }) => {
    let remaining = TOTAL;
    const slices: number[] = [];
    for (let index = 0; index < rungs; index += 1) {
      const slice = inferenceAttemptBudgetMs(remaining, rungs - index, opts);
      slices.push(slice);
      remaining = Math.max(0, remaining - slice);
    }
    return slices;
  };

  // The old shape: most rungs below a build-viable size.
  const before = ladder(4);
  assert.ok(
    before.filter((ms) => ms < MIN_VIABLE_BUILD_ATTEMPT_MS).length >= 3,
    'the un-floored ladder is expected to be mostly doomed rungs',
  );

  // The turn now plans only what the budget can fund at build size.
  const fundable = maxViableBuildAttempts(TOTAL);
  assert.ok(fundable >= 1 && fundable < 4, `expected fewer, viable rungs, got ${fundable}`);
  const after = ladder(fundable, { minAttemptMs: MIN_VIABLE_BUILD_ATTEMPT_MS });
  assert.equal(
    after.filter((ms) => ms < MIN_VIABLE_BUILD_ATTEMPT_MS).length,
    0,
    `every planned build rung must be able to finish; got ${after.map((ms) => `${Math.floor(ms / 1000)}s`).join(', ')}`,
  );
  assert.ok(after.reduce((sum, ms) => sum + ms, 0) <= TOTAL, 'the ladder must not exceed the turn budget');
});

test('BUILD budget: a tiny budget still plans one real attempt rather than none', () => {
  assert.equal(maxViableBuildAttempts(10_000), 1);
  assert.equal(maxViableBuildAttempts(0), 1);
});

test('an image turn keeps a pinned model that the catalogue says can see', async () => {
  /*
   * Route planning was handed the stored registry, which has no `vision` field —
   * and usually no row at all for a paid model, since the scanner persists only
   * free ones. So a pinned Claude with an image attached scored no vision
   * capability, was filtered out of its own turn, and the request silently
   * rerouted to Gemini (or 503'd when no Gemini credential existed). The flag has
   * to come from the catalogue that declares it.
   */
  const routes = await planInferenceRoutes({
    primaryModelId: 'vendor/seeing-model',
    fallbackModelIds: [],
    models: [{ id: 'vendor/seeing-model', vision: true, pricingKind: 'paid' }],
    requiredCapabilities: ['text', 'vision'],
    geminiAvailable: false,
    openRouterAvailable: true,
  });
  assert.equal(routes[0]?.id, 'vendor/seeing-model');
  assert.ok(routes[0].capabilities.includes('vision'));
  // Cost class is read from the same catalogue entry, so it resolves too — the
  // registry writes snake_case `pricing_kind`, which this never reads.
  assert.equal(routes[0].costClass, 'standard');
});

test('an image turn drops a model with no declared vision rather than guessing', async () => {
  const routes = await planInferenceRoutes({
    primaryModelId: 'vendor/text-only',
    fallbackModelIds: [],
    models: [{ id: 'vendor/text-only', pricingKind: 'paid' }],
    requiredCapabilities: ['text', 'vision'],
    geminiAvailable: false,
    openRouterAvailable: true,
  });
  assert.equal(routes.filter((route) => route.id === 'vendor/text-only').length, 0);
});

test('a retired model stays filtered out even when it is still listed', async () => {
  /*
   * The registry is the only source that knows a model was retired. Route
   * planning now merges it with the routing catalogue to pick up vision and
   * pricing — that merge must not resurrect a retired route just because the
   * catalogue still lists it.
   */
  const routes = await planInferenceRoutes({
    primaryModelId: 'vendor/retired-model',
    fallbackModelIds: [],
    models: [{ id: 'vendor/retired-model', lifecycle: 'retired', vision: true, pricingKind: 'paid' }],
    requiredCapabilities: ['text'],
    geminiAvailable: false,
    openRouterAvailable: true,
  });
  assert.equal(routes.filter((route) => route.id === 'vendor/retired-model').length, 0);
});

test('a batch endpoint is never routed to, whichever way it arrives', async () => {
  /*
   * Batch variants are asynchronous - they accept a job and answer later - so a
   * turn routed to one never replies. They are a trap because they are CHEAP:
   * google/gemini-3.7-flash:batch lists at $0.94 against $1.88 for the model
   * that can actually stream, so choosing on price picks the broken one.
   *
   * discoverAnthropicFlagships already filtered them, which left every other
   * entrance unguarded - an operator approving one, a pinned id, a curated row.
   */
  const routes = await planInferenceRoutes({
    primaryModelId: 'google/gemini-3.7-flash:batch',
    fallbackModelIds: ['anthropic/claude-opus-5:batch', 'vendor/model-batch'],
    models: [
      { id: 'google/gemini-3.7-flash:batch', vision: true, pricingKind: 'paid' },
      { id: 'anthropic/claude-opus-5:batch', pricingKind: 'paid' },
      { id: 'vendor/model-batch', pricingKind: 'paid' },
    ],
    requiredCapabilities: ['text'],
    geminiAvailable: true,
    openRouterAvailable: true,
  });
  assert.equal(
    routes.filter((r) => /batch/i.test(r.id)).length, 0,
    'no batch endpoint may be planned as a route, primary or fallback',
  );
});

test('a model whose name merely contains "batch" as a word part still routes', async () => {
  // The guard must not eat a legitimate id. Only a :batch or -batch suffix.
  const routes = await planInferenceRoutes({
    primaryModelId: 'vendor/batchelor-7b',
    fallbackModelIds: [],
    models: [{ id: 'vendor/batchelor-7b', pricingKind: 'paid' }],
    requiredCapabilities: ['text'],
    geminiAvailable: false,
    openRouterAvailable: true,
  });
  assert.equal(routes[0]?.id, 'vendor/batchelor-7b');
});

test('INVARIANT: a credentialed gateway is never left out of the plan', async () => {
  /*
   * The failure this closes, from PR #319: the last resort was injected only
   * when the pool was COMPLETELY empty, and only for Gemini. So when the
   * registry marked every Gemini row offline but left an OpenRouter row
   * standing, the pool was non-empty, nothing was injected, and Gemini was
   * absent — the client painting "no healthy AI route" for a gateway whose
   * credential was sitting right there.
   */
  const routes = await planInferenceRoutes({
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    geminiAvailable: true,
    openRouterAvailable: true,
    models: [
      { id: 'gemini-flash-latest', available: false, lifecycle: 'unavailable' },
    ],
  });
  const gateways = new Set(routes.map((route) => route.gateway));
  assert.ok(gateways.has('gemini'), 'a credentialed Gemini is reachable even when its registry row says otherwise');
  assert.ok(gateways.has('openrouter'), 'and so is OpenRouter');
  /*
   * Coverage is the invariant, NOT position. The caller asked for nemotron and
   * nothing has shown it to be dead, so it stays first: injecting a last resort
   * must never silently swap out the model a person chose. The zero-cost
   * gateway earns its place as the first fallback, not as a demotion of the
   * primary.
   */
  assert.equal(routes[0].id, 'nvidia/nemotron-3-super-120b-a12b:free', 'the chosen primary is not demoted by an injection');
  assert.equal(routes[1].gateway, 'gemini', 'the zero-cost gateway is the first thing tried after it');
});

test('an injected Gemini leads when the primary itself is unusable', async () => {
  /*
   * Same fixture, except the primary is the row the registry marks dead. With
   * nothing of the caller's own left to honour, the free gateway leads.
   */
  const routes = await planInferenceRoutes({
    primaryModelId: 'gemini-flash-latest',
    fallbackModelIds: [],
    geminiAvailable: true,
    openRouterAvailable: true,
    models: [
      { id: 'gemini-flash-latest', available: false, lifecycle: 'unavailable' },
    ],
  });
  assert.ok(routes.length >= 1);
  assert.equal(routes[0].gateway, 'gemini', 'the zero-cost last resort is tried before the paid one');
});

test('a gateway with no credential is never injected', async () => {
  const routes = await planInferenceRoutes({
    primaryModelId: 'gemini-flash-latest',
    geminiAvailable: true,
    openRouterAvailable: false,
  });
  assert.ok(routes.length >= 1);
  assert.ok(
    routes.every((route) => route.gateway === 'gemini'),
    'no OpenRouter route may appear without an OpenRouter credential',
  );
});

test('a refused OpenRouter gateway costs its routes, not the deployment', async () => {
  /*
   * MEASURED, not supposed. On 2026-09-04 the deployed health payload read
   * openRouterConfigured: true, routeCount: 3, ready: true while /auth/key
   * answered HTTP 401 for that exact key — so the router planned rungs on a
   * gateway that could not answer, and the golden chat spent its last attempt
   * on a FREE model there. Free models present the same credential.
   *
   * Both halves of the trade are asserted together on purpose:
   *   - the refused gateway stops being counted, so no retry is spent on it;
   *   - `ready` survives on Gemini alone, because failing every deployment over
   *     an OpenRouter key that needs rotating is the imprecise blocking gate
   *     CLAUDE.md §5 warns gets muted, and then protects nothing.
   */
  const both = await summarizeInferenceReadiness({ geminiAvailable: true, openRouterAvailable: true });
  const refused = await summarizeInferenceReadiness({ geminiAvailable: true, openRouterAvailable: false });

  assert.equal(refused.ready, true, 'Gemini is a separate gateway with its own credential');
  assert.ok(refused.routeCount >= 1, 'a deployment that can still serve must still offer a route');
  assert.ok(
    refused.routeCount < both.routeCount,
    `a refused gateway must cost its routes (both=${both.routeCount}, refused=${refused.routeCount})`,
  );

  // And when the refused gateway was the only one, the deployment says so.
  const nothingLeft = await summarizeInferenceReadiness({ geminiAvailable: false, openRouterAvailable: false });
  assert.equal(nothingLeft.ready, false);
  assert.equal(nothingLeft.routeCount, 0);
});

/*
 * A BILLING REFUSAL HOLDS THE ROUTE FOR AS LONG AS MONEY TAKES (2026-09-06).
 * Five minutes re-tried a capped Gemini project all day; thirty holds it open
 * long enough to matter, and a top-up is noticed within the half hour.
 */
test('a billing refusal holds the whole route for thirty minutes; other failures keep their short resets', async () => {
  const recorded: Array<{ key: string; resetMs: number; failureThreshold: number }> = [];
  const store = {
    recordFailure: async (key: string, options: { resetMs: number; failureThreshold: number }) => { recorded.push({ key, resetMs: options.resetMs, failureThreshold: options.failureThreshold }); return { open: false }; },
  } as any;
  const route = { id: 'gemini-flash-latest', gateway: 'gemini', circuitKey: 'gemini:server', domainCircuitKey: 'gemini:server:quota' } as any;
  await recordInferenceRouteFailure(store, route, 403, 1, { billing: true });
  await recordInferenceRouteFailure(store, route, 429, 2, { billing: true });
  await recordInferenceRouteFailure(store, route, 429, 3);
  await recordInferenceRouteFailure(store, route, 403, 4);
  assert.equal(BILLING_RESET_MS, 30 * 60_000);
  assert.deepEqual(recorded.map((r) => [r.key, r.resetMs]), [
    ['gemini:server', BILLING_RESET_MS],
    ['gemini:server', BILLING_RESET_MS],
    ['gemini:server:quota', 60_000],
    ['gemini:server', 5 * 60_000],
  ], 'billing holds the route key, not the quota domain, whatever the status; the rest is unchanged');
  assert.ok(recorded.every((r) => r.failureThreshold === 2), 'the threshold is unchanged');
});

/*
 * INDEPENDENCE BEATS DEPTH (2026-09-06). With a Gemini model pinned, a build's
 * two fundable rungs were both Gemini; Google refused the spend cap twice and
 * the OpenRouter rung that would have answered had been trimmed for budget.
 */
const rung = (id: string, gateway: 'gemini' | 'openrouter', circuit: 'closed' | 'open' = 'closed') => ({ id, gateway, provider: gateway, circuit } as any);

test('BUILD trim: a ladder cut to one gateway keeps one rung on the other gateway in its last slot', () => {
  const pinnedGemini = [rung('gemini-flash-latest', 'gemini'), rung('gemini-flash-latest', 'gemini'), rung('deepseek/deepseek-chat', 'openrouter')];
  assert.deepEqual(trimBuildLadder(pinnedGemini, 2).map((r) => r.id), ['gemini-flash-latest', 'deepseek/deepseek-chat'], 'the pin stays first; the second chance is on the other gateway');
  const pinnedOpenRouter = [rung('deepseek/deepseek-chat', 'openrouter'), rung('nvidia/nemotron-3-super-120b-a12b:free', 'openrouter'), rung('gemini-flash-latest', 'gemini')];
  assert.deepEqual(trimBuildLadder(pinnedOpenRouter, 2).map((r) => r.id), ['deepseek/deepseek-chat', 'gemini-flash-latest'], 'and the other way round');
});

test('BUILD trim: a ladder that already spans both gateways, or fits the budget, is untouched', () => {
  const spanning = [rung('gemini-flash-latest', 'gemini'), rung('deepseek/deepseek-chat', 'openrouter'), rung('gemini-flash-latest', 'gemini')];
  assert.deepEqual(trimBuildLadder(spanning, 2).map((r) => r.id), ['gemini-flash-latest', 'deepseek/deepseek-chat']);
  const short = [rung('gemini-flash-latest', 'gemini'), rung('gemini-flash-latest', 'gemini')];
  assert.equal(trimBuildLadder(short, 2), short, 'nothing to trim, nothing to swap');
});

test('BUILD trim: one fundable rung keeps the primary, and an open circuit is never swapped in', () => {
  const pinnedGemini = [rung('gemini-flash-latest', 'gemini'), rung('gemini-flash-latest', 'gemini'), rung('deepseek/deepseek-chat', 'openrouter')];
  assert.deepEqual(trimBuildLadder(pinnedGemini, 1).map((r) => r.id), ['gemini-flash-latest'], 'no second chance to give');
  const openOther = [rung('gemini-flash-latest', 'gemini'), rung('gemini-flash-latest', 'gemini'), rung('deepseek/deepseek-chat', 'openrouter', 'open')];
  assert.deepEqual(trimBuildLadder(openOther, 2).map((r) => r.id), ['gemini-flash-latest', 'gemini-flash-latest'], 'a dead rung is not independence');
});

test('the chat handler trims a build ladder through trimBuildLadder, never a bare slice', async () => {
  const { readFileSync } = await import('node:fs');
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /if \(attempts\.length > fundable\) attempts = trimBuildLadder\(attempts, fundable\);/);
  assert.doesNotMatch(handler, /attempts = attempts\.slice\(0, fundable\)/, 'the old trim kept two rungs on one dead gateway');
});

/*
 * Phase 6: the ladder reads the ledger. A model that failed most of its recent
 * turns moves down; a model the person named stays first; nothing is removed.
 */
const poorEvidence = (modelId: string) => ({
  [modelId]: { modelId, samples: 8, successes: 2, failures: 6, failureRate: 0.75, p50LatencyMs: 1400 },
});

test('measured outcome moves a failing fallback down the free ladder and says so', async () => {
  const base = {
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModelIds: ['deepseek/deepseek-chat', 'gemini-flash-latest'],
    geminiAvailable: true,
    openRouterAvailable: true,
    geminiCredentialScope: 'server' as const,
    openRouterCredentialScope: 'server' as const,
  };
  const plain = await planInferenceRoutes(base);
  const secondId = plain[1].id;
  const ranked = await planInferenceRoutes({ ...base, measuredOutcomes: poorEvidence(secondId) });
  assert.equal(ranked[0].id, plain[0].id, 'the primary is untouched');
  assert.notEqual(ranked[1].id, secondId, 'the failing fallback no longer comes second');
  const moved = ranked.find((route) => route.id === secondId);
  assert.ok(moved, 'it is still in the ladder');
  assert.equal(moved?.demoted, 'measured-outcome');
  assert.equal(moved?.measured?.failures, 6);
  assert.equal(ranked.length, plain.length, 'nothing is removed');
});

test('a model the person named stays first even when the ledger is against it; Auto yields to a better-measured route', async () => {
  const base = {
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModelIds: ['deepseek/deepseek-chat', 'gemini-flash-latest'],
    geminiAvailable: true,
    openRouterAvailable: true,
    geminiCredentialScope: 'server' as const,
    openRouterCredentialScope: 'server' as const,
    measuredOutcomes: poorEvidence('nvidia/nemotron-3-super-120b-a12b:free'),
  };
  const pinned = await planInferenceRoutes({ ...base, autoRouting: false });
  assert.equal(pinned[0].id, 'nvidia/nemotron-3-super-120b-a12b:free', 'their choice is tried first');
  assert.equal(pinned[0].measured?.failureRate, 0.75, 'and the trace can say what was measured');

  const auto = await planInferenceRoutes({ ...base, autoRouting: true });
  assert.notEqual(auto[0].id, 'nvidia/nemotron-3-super-120b-a12b:free', 'Auto starts on a route the ledger has not condemned');
  assert.equal(auto[0].demoted, undefined);
  const demoted = auto.find((route) => route.id === 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(demoted?.demoted, 'measured-outcome', 'the requested model is still in the ladder, lower');
  assert.equal(auto.length, pinned.length);
});

test('with no measured evidence the ladder is exactly what it was', async () => {
  const base = {
    primaryModelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackModelIds: ['deepseek/deepseek-chat', 'gemini-flash-latest'],
    geminiAvailable: true,
    openRouterAvailable: true,
    geminiCredentialScope: 'server' as const,
    openRouterCredentialScope: 'server' as const,
  };
  const plain = await planInferenceRoutes(base);
  const withEmpty = await planInferenceRoutes({ ...base, measuredOutcomes: {}, autoRouting: true });
  assert.deepEqual(withEmpty.map((route) => route.id), plain.map((route) => route.id));
  assert.ok(withEmpty.every((route) => !route.demoted));
});
