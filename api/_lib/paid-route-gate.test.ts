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
  const note = describePaidHold(decidePaidRoute({ ok: false, usage: null, limit: null }));
  assert.match(note, /could not be read/);
  assert.doesNotMatch(note, /\$0\.00/, 'unknown spend must never be printed as zero');
});

test('nothing is said when premium is available', () => {
  assert.equal(describePaidHold(decidePaidRoute({ ok: true, usage: 1, limit: 100 })), '');
  assert.equal(describePaidHold(null), '');
});
