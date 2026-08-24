import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCanaryPromotion,
  buildAdminModelLists,
  isAutoPromoteCandidate,
  isStudioFreeEligible,
  pricingKindFromEntry,
  rankCanaryCandidates,
} from './model-lifecycle.js';

test('pricingKindFromEntry labels free, free-tier, and paid honestly', () => {
  assert.equal(pricingKindFromEntry({ id: 'x:free', pricing: { prompt: '1', completion: '1' } }), 'free');
  assert.equal(pricingKindFromEntry({ id: 'gemini-flash-latest' }), 'free-tier');
  assert.equal(pricingKindFromEntry({ id: 'openai/gpt-4o-mini', pricing: { prompt: '0.1', completion: '0.2' } }), 'paid');
  assert.equal(pricingKindFromEntry({ pricingKind: 'free-tier' }), 'free-tier');
});

test('isStudioFreeEligible only allows free / free-tier', () => {
  assert.equal(isStudioFreeEligible('free'), true);
  assert.equal(isStudioFreeEligible('free-tier'), true);
  assert.equal(isStudioFreeEligible('paid'), false);
  assert.equal(isStudioFreeEligible('unknown'), false);
});

test('paid models are never auto-promote candidates', () => {
  assert.equal(isAutoPromoteCandidate({
    id: 'paid/model',
    is_free: false,
    approved: false,
    lifecycle: 'discovered',
    pricing: { prompt: '1', completion: '1' },
  }), false);
  assert.equal(isAutoPromoteCandidate({
    id: 'vendor/model:free',
    is_free: true,
    approved: false,
    lifecycle: 'discovered',
    pricing: { prompt: '0', completion: '0' },
  }), true);
  assert.equal(isAutoPromoteCandidate({
    id: 'vendor/model:free',
    is_free: true,
    approved: true,
    lifecycle: 'available',
  }), false);
});

test('applyCanaryPromotion promotes only on pass; failures stay discovered', () => {
  const base = {
    id: 'vendor/new:free',
    is_free: true,
    approved: false,
    lifecycle: 'discovered',
    name: 'New',
  };
  const win = applyCanaryPromotion(base, {
    passed: true,
    ranAt: '2026-08-24T00:00:00.000Z',
    results: [{ id: 'ping', passed: true }],
  }, { nowIso: '2026-08-24T00:00:00.000Z', actor: 'test' });
  assert.equal(win.promoted, true);
  assert.equal(win.row.approved, true);
  assert.equal(win.row.lifecycle, 'available');
  assert.equal(win.event.event_type, 'approved');

  const lose = applyCanaryPromotion(base, {
    passed: false,
    ranAt: '2026-08-24T00:00:00.000Z',
    results: [{ id: 'ping', passed: false }],
    error: 'fail',
  }, { nowIso: '2026-08-24T00:00:00.000Z' });
  assert.equal(lose.promoted, false);
  assert.equal(lose.row.approved, false);
  assert.equal(lose.row.lifecycle, 'discovered');
});

test('rankCanaryCandidates prefers newly discovered free models', () => {
  const now = Date.parse('2026-08-24T12:00:00.000Z');
  const ranked = rankCanaryCandidates([
    { id: 'old:free', is_free: true, lifecycle: 'discovered', first_seen_at: '2026-01-01T00:00:00.000Z', last_event: 'listed' },
    { id: 'new:free', is_free: true, lifecycle: 'discovered', first_seen_at: '2026-08-20T00:00:00.000Z', last_event: 'discovered' },
    { id: 'paid', is_free: false, lifecycle: 'discovered', first_seen_at: '2026-08-20T00:00:00.000Z', last_event: 'discovered' },
  ], now);
  assert.deepEqual(ranked.map((r) => r.id), ['new:free', 'old:free']);
});

test('buildAdminModelLists returns Active / Newly added / Internet-available', () => {
  const lists = buildAdminModelLists({
    featuredModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', pricingKind: 'free-tier', available: true }],
    registryRows: [
      {
        id: 'vendor/new:free',
        name: 'New Free',
        provider: 'Vendor',
        is_free: true,
        approved: false,
        lifecycle: 'discovered',
        last_event: 'discovered',
        first_seen_at: new Date().toISOString(),
      },
      {
        id: 'vendor/active:free',
        name: 'Active Free',
        provider: 'Vendor',
        is_free: true,
        approved: true,
        lifecycle: 'available',
        last_event: 'approved',
        first_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    internetEntries: [
      { id: 'vendor/paid', name: 'Paid', provider: 'Vendor', pricingKind: 'paid', source: 'openrouter' },
      { id: 'vendor/free:free', name: 'Free', provider: 'Vendor', pricingKind: 'free', source: 'openrouter' },
    ],
  });

  assert.ok(lists.active.some((m) => m.id === 'gemini-flash-latest'));
  assert.ok(lists.active.some((m) => m.id === 'vendor/active:free'));
  assert.ok(lists.newlyAdded.some((m) => m.id === 'vendor/new:free'));
  assert.equal(lists.internetAvailable[0].pricingKind, 'free');
  assert.equal(lists.internetAvailable.find((m) => m.id === 'vendor/paid')?.paidOnly, true);
  assert.equal(lists.internetAvailable.find((m) => m.id === 'vendor/paid')?.selectable, false);
  assert.equal(lists.summary.active, 2);
  assert.equal(lists.summary.newlyAdded, 1);
});
