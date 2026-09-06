import test from 'node:test';
import assert from 'node:assert/strict';
import { RESERVE_USD, decidePaidRoute, describePaidHold, paidRouteAllowed, resetPaidRouteCache } from './paid-route-gate.js';

/*
 * The cost-control subsystem was written, tested and called by nothing:
 * recordModelSpend, readMonthlySpend, canOfferPaidLastResort, decidePaidSpend,
 * estimateCallCostUsd and describeSpendState all had zero callers. Every budget
 * conversation was unenforceable — no meter, no brake.
 */

test('room left allows a paid route', () => {
  const v = decidePaidRoute({ ok: true, usage: 12, limit: 100 });
  assert.equal(v.allowed, true);
  assert.equal(v.remainingUsd, 88);
  assert.match(v.reason, /\$88\.00 of \$100\.00 remaining/);
});

test('the reserve holds paid back before the account is actually empty', () => {
  // A turn already in flight must be able to finish.
  const v = decidePaidRoute({ ok: true, usage: 99.5, limit: 100 });
  assert.equal(v.allowed, false);
  assert.equal(v.remainingUsd, 0.5);
  assert.match(v.reason, /paid routes are held back so free ones keep working/);
  assert.equal(decidePaidRoute({ ok: true, usage: 100 - RESERVE_USD, limit: 100 }).allowed, false);
  assert.equal(decidePaidRoute({ ok: true, usage: 100 - RESERVE_USD - 0.01, limit: 100 }).allowed, true);
});

test('an unreadable meter is a refusal, never an assumed zero', () => {
  // Inherited verbatim from spend-ledger, which stated this rule and was then
  // never wired up to enforce it.
  const v = decidePaidRoute({ ok: false, usage: null, limit: null });
  assert.equal(v.allowed, false);
  assert.match(v.reason, /could not be read/);
  assert.equal(decidePaidRoute({ ok: true, usage: null, limit: 100 }).allowed, false,
    'a limit with no spend figure cannot be reasoned about');
});

test('an uncapped key is not an empty one', () => {
  // remaining = limit - usage would read a null limit as a negative balance.
  const v = decidePaidRoute({ ok: true, usage: 4000, limit: null });
  assert.equal(v.allowed, true);
  assert.equal(v.remainingUsd, null);
  assert.match(v.reason, /no ceiling set/);
});

test('no credential is no paid route', async () => {
  resetPaidRouteCache();
  const v = await paidRouteAllowed('');
  assert.equal(v.allowed, false);
  assert.match(v.reason, /no OpenRouter credential/);
});

test('a live read is used, and cached so a turn adds no round trip', async () => {
  resetPaidRouteCache();
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ data: { usage: 20, limit: 100, label: 'k' } }) };
  }) as any;
  const first = await paidRouteAllowed('sk-or-v1-test', { fetchFn, now: 1_000 });
  assert.equal(first.allowed, true);
  assert.equal(first.remainingUsd, 80);
  await paidRouteAllowed('sk-or-v1-test', { fetchFn, now: 30_000 });
  assert.equal(calls, 1, 'a chat turn must not add a round trip to OpenRouter');
  await paidRouteAllowed('sk-or-v1-test', { fetchFn, now: 200_000 });
  assert.equal(calls, 2, 'the cache expires');
});

test('a transient failure refuses without being cached', async () => {
  resetPaidRouteCache();
  let calls = 0;
  const fetchFn = (async () => { calls += 1; throw new Error('network down'); }) as any;
  const first = await paidRouteAllowed('sk-or-v1-test', { fetchFn, now: 1_000 });
  assert.equal(first.allowed, false);
  await paidRouteAllowed('sk-or-v1-test', { fetchFn, now: 2_000 });
  assert.equal(calls, 2, 'one blip must not lock paid routing off for a minute');
});

test('a withheld premium route says why, with the number', () => {
  // A silent downgrade is the defect this repo keeps deleting: the turn quietly
  // runs on a weaker model and nothing says why.
  const held = decidePaidRoute({ ok: true, usage: 99.4, limit: 100 });
  const note = describePaidHold(held);
  assert.match(note, /\$0\.60 left of \$100\.00 this month/);
  assert.match(note, /Free routes still work/);
  assert.match(note, /Raise the ceiling/);
});

test('an unreadable meter is explained, not dressed up as a balance', () => {
  /*
   * This used to assert the copy contained "could not be read" — it pinned the
   * defect. Those eleven words were identical for a rejected key, an empty
   * balance, a rate limit and a timeout, so the assertion passed while the
   * sentence told nobody anything. What it must do is name the fault and a
   * remedy; what it must still never do is invent a figure it does not have.
   */
  const note = describePaidHold(decidePaidRoute({ ok: false, usage: null, limit: null }));
  assert.match(note, /never reached OpenRouter/);
  assert.match(note, /fails closed/);
  assert.doesNotMatch(note, /\$0\.00/, 'unknown spend must never be printed as zero');
});

test('nothing is said when premium is available', () => {
  assert.equal(describePaidHold(decidePaidRoute({ ok: true, usage: 1, limit: 100 })), '');
  assert.equal(describePaidHold(null), '');
});

/*
 * ---------------------------------------------------------------------------
 * A REFUSAL MUST CARRY ITS CAUSE
 *
 * decidePaidRoute was typed `{ ok, usage, limit }` while its caller handed it
 * the whole OpenRouterAuthResult. `status` and the provider's scrubbed message
 * were present on the object and dropped by the parameter type, so production
 * reported the same eleven words — "the spend meter could not be read" — for
 * four faults with four different remedies. These pin the carriage.
 * ---------------------------------------------------------------------------
 */

test('402 is a wallet, not a bad key — and it is tested first', () => {
  /*
   * ORDER IS THE WHOLE TEST. isProviderCredentialRejection returns true for
   * 401, 402 AND 403, so classifying in the obvious order reports an empty
   * balance as a rejected credential and sends somebody to re-issue a key that
   * was working. The identical ordering trap was shipped and caught in
   * qir-persist-diagnosis.js earlier the same day.
   */
  const v = decidePaidRoute({ ok: false, usage: null, limit: null, status: 402, error: 'Insufficient credits' });
  assert.equal(v.allowed, false);
  assert.equal(v.meterFault?.cause, 'NO_CREDIT');
  assert.match(v.meterFault?.remedy || '', /Top up/i);
  assert.doesNotMatch(v.meterFault?.remedy || '', /rejected the credential itself/,
    'an empty balance must never be described as a rejected key');
  // And it must NOT claim the free rung is dead: 402 is charged per call.
  assert.equal(v.meterFault?.gatewayDead, false);
});

test('a rejected key kills the free rung too, and says so', () => {
  /*
   * /auth/key authenticates the SAME credential a ":free" model presents. The
   * hold copy asserted "Free routes still work" unconditionally, which for this
   * one fault is false — and it is the fault most likely to be present when a
   * turn dies on a free model while readiness still counts it as a route.
   */
  const v = decidePaidRoute({ ok: false, usage: null, limit: null, status: 401, error: 'No auth credentials found' });
  assert.equal(v.meterFault?.cause, 'CREDENTIAL_REJECTED');
  assert.equal(v.meterFault?.gatewayDead, true);
  const hold = describePaidHold(v);
  assert.match(hold, /every FREE OpenRouter model/,
    'the free rung must be named explicitly — "no model on that gateway" leaves it ambiguous');
  assert.doesNotMatch(hold, /Free routes still work/,
    'a credential OpenRouter refuses cannot run a free model either');
});

test('rate limit, provider error and an unreachable meter stay distinct', () => {
  assert.equal(decidePaidRoute({ ok: false, usage: null, limit: null, status: 429, error: 'rate limited' }).meterFault?.cause, 'RATE_LIMITED');
  assert.equal(decidePaidRoute({ ok: false, usage: null, limit: null, status: 503, error: 'upstream' }).meterFault?.cause, 'PROVIDER_ERROR');
  // No status at all is the timeout/network shape checkOpenRouterKey returns.
  assert.equal(decidePaidRoute({ ok: false, usage: null, limit: null, status: null, error: 'timed out after 8000ms' }).meterFault?.cause, 'METER_UNREACHABLE');
  assert.equal(decidePaidRoute({ ok: false, usage: null, limit: null }).meterFault?.cause, 'METER_UNREACHABLE');
});

test('no refusal is ever left without something a human can act on', () => {
  /*
   * The invariant, stated once so a future branch cannot quietly reintroduce
   * the flat sentence: every refusal either names a fault with a remedy, or
   * carries the spend figures that explain it. Never neither.
   */
  const refusals = [
    decidePaidRoute({ ok: false, usage: null, limit: null, status: 401, error: 'nope' }),
    decidePaidRoute({ ok: false, usage: null, limit: null, status: 402, error: 'nope' }),
    decidePaidRoute({ ok: false, usage: null, limit: null, status: 429, error: 'nope' }),
    decidePaidRoute({ ok: false, usage: null, limit: null, status: 500, error: 'nope' }),
    decidePaidRoute({ ok: false, usage: null, limit: null }),
    decidePaidRoute({ ok: true, usage: 99.5, limit: 100 }),
    decidePaidRoute({ ok: true, usage: null, limit: 100 }),
  ];
  for (const verdict of refusals) {
    assert.equal(verdict.allowed, false);
    const actionable = Boolean(verdict.meterFault?.remedy)
      || (verdict.limitUsd !== null && verdict.remainingUsd !== null)
      // The one remaining case: the meter read, but reported no spend figure.
      || /no spend figure/.test(verdict.reason);
    assert.ok(actionable, `refusal carries nothing actionable: ${JSON.stringify(verdict)}`);
    assert.notEqual(verdict.reason, 'the spend meter could not be read',
      'the flat sentence that named nothing must not come back');
  }
});

test('an allowed verdict carries no fault', () => {
  assert.equal(decidePaidRoute({ ok: true, usage: 12, limit: 100 }).meterFault, null);
  assert.equal(decidePaidRoute({ ok: true, usage: 4000, limit: null }).meterFault, null);
});

test('no credential names the environment, not the provider', async () => {
  resetPaidRouteCache();
  const v = await paidRouteAllowed('');
  assert.equal(v.meterFault?.cause, 'METER_UNREACHABLE');
  assert.equal(v.meterFault?.gatewayDead, true, 'without a key nothing on that gateway runs');
  assert.match(v.meterFault?.remedy || '', /OPENROUTER_API_KEY/);
});

test('a refusal the provider ANSWERED is cached; one we could not verify is not', async () => {
  /*
   * The distinction is the whole point. "OpenRouter said 401" is settled until
   * a human changes the key — re-asking every turn adds 8 seconds to the path
   * the user is waiting on, and that probe now also narrows routing. "We could
   * not reach OpenRouter" is not settled, and caching it would pin paid routing
   * off for a minute after one blip.
   */
  resetPaidRouteCache();
  let answered = 0;
  const rejects = (async () => {
    answered += 1;
    return { ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'Missing Authentication header' } }) };
  }) as any;
  const first = await paidRouteAllowed('sk-or-v1-rejected', { fetchFn: rejects, now: 1_000 });
  assert.equal(first.meterFault?.cause, 'CREDENTIAL_REJECTED');
  await paidRouteAllowed('sk-or-v1-rejected', { fetchFn: rejects, now: 30_000 });
  assert.equal(answered, 1, 'a settled refusal must not be re-asked every turn');
  await paidRouteAllowed('sk-or-v1-rejected', { fetchFn: rejects, now: 200_000 });
  assert.equal(answered, 2, 'and it must still expire, so a repaired key is picked up');

  resetPaidRouteCache();
  let blips = 0;
  const blip = (async () => { blips += 1; throw new Error('network down'); }) as any;
  await paidRouteAllowed('sk-or-v1-blip', { fetchFn: blip, now: 1_000 });
  await paidRouteAllowed('sk-or-v1-blip', { fetchFn: blip, now: 2_000 });
  assert.equal(blips, 2, 'an unverified refusal is still re-checked next turn');
});

test('only an answered 401/403 may narrow routing', () => {
  /*
   * gatewayDead is now load-bearing: chat-handler drops OpenRouter from route
   * planning on it. So it must fire ONLY where every retry would fail
   * identically until a human acts. A timeout, a 5xx and a rate limit are all
   * "we could not ask" or "not now" — narrowing on those would strand turns on
   * a gateway that was about to work, which is the imprecise gate CLAUDE.md §5
   * warns gets muted and then protects nothing.
   */
  const dead = (status, error) => decidePaidRoute({ ok: false, usage: null, limit: null, status, error }).meterFault?.gatewayDead;
  assert.equal(dead(401, 'Missing Authentication header'), true);
  assert.equal(dead(403, 'forbidden'), true);
  assert.equal(dead(402, 'Insufficient credits'), false, 'an empty balance still serves free models');
  assert.equal(dead(429, 'rate limited'), false, 'a rate limit is not now, not never');
  assert.equal(dead(503, 'upstream'), false, 'the provider faltering is not a refused key');
  assert.equal(dead(null, 'timed out after 8000ms'), false, 'we could not ask is not we were told no');
});

test('the router reads the meter, not just the key', async () => {
  /*
   * A source assertion, because planInferenceRoutes is called deep inside the
   * chat handler with no seam to drive from a test — the same tradeoff taken
   * deliberately in provider-failure-message.test.js.
   *
   * It guards the wiring, which is the part that was missing rather than the
   * arithmetic: the verdict was computed one line above planInferenceRoutes and
   * the plan still asked only whether a key EXISTED.
   */
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const handler = readFileSync(path.join(import.meta.dirname, 'chat-handler.ts'), 'utf8');

  assert.doesNotMatch(
    handler,
    /openRouterAvailable: Boolean\(effectiveOpenRouterKey\)/,
    'presence is not validity — the meter has already answered by this point',
  );
  assert.match(handler, /gatewayDead !== true/, 'the plan must consult the meter fault');
  /*
   * Every call site, not a fixed count: the third site arrived on 2026-09-06
   * (a tools turn refused by Gemini re-plans text-only on OpenRouter), and a
   * count of two would have failed the exact change that reads the meter
   * correctly. The invariant is that no plan asks only whether a key exists.
   */
  const planSites = (handler.match(/await planInferenceRoutes\(\{/g) || []).length;
  const usableSites = (handler.match(/openRouterAvailable: openRouterUsable/g) || []).length;
  assert.ok(planSites >= 2, 'at least the primary plan and the travel retry');
  assert.equal(usableSites, planSites, `every planInferenceRoutes call site reads the meter (${planSites} sites: the primary plan, the travel retry, the refused-tools re-plan)`);
});
