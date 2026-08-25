import assert from 'node:assert/strict';
import test from 'node:test';
import { decidePaidSpend } from '../../src/lib/spend-ledger.js';
import { configuredCeilingUsd, readMonthlySpend, recordModelSpend } from './spend-store.js';

const realFetch = globalThis.fetch;
const env = { ...process.env };

function restore() {
  globalThis.fetch = realFetch;
  process.env = { ...env };
}

function configure(ceiling = '50') {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.QUANTORA_PAID_MONTHLY_CEILING_USD = ceiling;
}

function respond(body: unknown, ok = true) {
  globalThis.fetch = (async () => ({ ok, json: async () => body })) as any;
}

test('unconfigured Supabase means no paid fallback, not unlimited spend', async () => {
  restore();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const snap = await readMonthlySpend();
  assert.equal(snap.known, false);
  assert.equal(decidePaidSpend({ ...snap, ledgerKnown: snap.known, estimatedCostUsd: 0.01 }).allowed, false);
  restore();
});

test('an unreachable ledger closes paid routing', async () => {
  configure();
  globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
  const snap = await readMonthlySpend();
  assert.equal(snap.known, false, 'a network failure must never read as zero spend');
  assert.equal(
    decidePaidSpend({ spentUsd: snap.spentUsd, ceilingUsd: snap.ceilingUsd, ledgerKnown: snap.known, estimatedCostUsd: 0.01 }).reason,
    'ledger-unavailable',
  );
  restore();
});

test('a non-OK response closes paid routing', async () => {
  configure();
  respond({ message: 'permission denied' }, false);
  assert.equal((await readMonthlySpend()).known, false);
  restore();
});

test('unparseable rows close paid routing', async () => {
  configure();
  globalThis.fetch = (async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })) as any;
  assert.equal((await readMonthlySpend()).known, false);
  restore();
});

test('an untouched month is a KNOWN zero, not an unknown', async () => {
  // The table is reachable and this month simply has no row yet. That must be
  // spendable, otherwise the budget could never be used at all.
  configure();
  respond([]);
  const snap = await readMonthlySpend();
  assert.equal(snap.known, true);
  assert.equal(snap.spentUsd, 0);
  assert.equal(decidePaidSpend({ ...snap, ledgerKnown: snap.known, estimatedCostUsd: 0.01 }).allowed, true);
  restore();
});

test('a real row is read and enforced against the ceiling', async () => {
  configure('50');
  respond([{ month_key: '2026-08', spent_usd: 49.999, calls: 1200 }]);
  const snap = await readMonthlySpend();
  assert.equal(snap.known, true);
  assert.equal(snap.ceilingUsd, 50);
  const decision = decidePaidSpend({ spentUsd: snap.spentUsd, ceilingUsd: snap.ceilingUsd, ledgerKnown: true, estimatedCostUsd: 0.05 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'would-exceed-ceiling');
  restore();
});

test('recording returns the new running total', async () => {
  configure();
  respond([{ month_key: '2026-08', spent_usd: 1.25, calls: 3 }]);
  const snap = await recordModelSpend(0.25);
  assert.equal(snap.known, true);
  assert.equal(snap.spentUsd, 1.25);
  assert.equal(snap.calls, 3);
  restore();
});

test('a failed record closes paid routing — unaccounted spend must stop', async () => {
  configure();
  respond({ message: 'nope' }, false);
  assert.equal((await recordModelSpend(0.25)).known, false);
  restore();
});

test('no configured ceiling means no paid budget', async () => {
  restore();
  delete process.env.QUANTORA_PAID_MONTHLY_CEILING_USD;
  assert.equal(configuredCeilingUsd(), 0);
  process.env.QUANTORA_PAID_MONTHLY_CEILING_USD = 'not-a-number';
  assert.equal(configuredCeilingUsd(), 0);
  process.env.QUANTORA_PAID_MONTHLY_CEILING_USD = '-10';
  assert.equal(configuredCeilingUsd(), 0);
  process.env.QUANTORA_PAID_MONTHLY_CEILING_USD = '50';
  assert.equal(configuredCeilingUsd(), 50);
  restore();
});
