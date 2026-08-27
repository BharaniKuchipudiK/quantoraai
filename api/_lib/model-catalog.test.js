import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_MODELS,
  buildInternetCatalogEntries,
  discoverAnthropicFlagships,
  formatContext,
  isFreeModel,
  metadataFingerprint,
  providerFromId,
} from './model-catalog.js';

test('recognizes explicit free slugs and zero-priced models', () => {
  assert.equal(isFreeModel({ id: 'vendor/model:free', pricing: { prompt: '1', completion: '1' } }), true);
  assert.equal(isFreeModel({ id: 'vendor/model', pricing: { prompt: '0', completion: '0' } }), true);
  assert.equal(isFreeModel({ id: 'vendor/model', pricing: { prompt: '0', completion: '0.000001' } }), false);
  assert.equal(isFreeModel({ id: 'vendor/model', pricing: {} }), false);
});

test('formats context windows without overstating missing values', () => {
  assert.equal(formatContext(1_000_000), '1M');
  assert.equal(formatContext(131_072), '131k');
  assert.equal(formatContext(null), '—');
});

test('fingerprints change when operational metadata changes', () => {
  const base = { id: 'vendor/model', name: 'Model', context_length: 8_192, pricing: { prompt: '0', completion: '0' } };
  assert.equal(metadataFingerprint(base), metadataFingerprint({ ...base }));
  assert.notEqual(metadataFingerprint(base), metadataFingerprint({ ...base, context_length: 16_384 }));
  assert.notEqual(metadataFingerprint(base), metadataFingerprint({ ...base, pricing: { prompt: '0.1', completion: '0' } }));
});

test('derives readable provider names from namespaced ids', () => {
  assert.equal(providerFromId('deepseek/deepseek-chat'), 'Deepseek');
  assert.equal(providerFromId(''), 'Unknown');
});

test('curated models are unique and namespaced (durable curation invariant)', () => {
  // The specific curated set is a product decision that changes as models are
  // curated in/out; this guards the invariant that survives those changes —
  // every curated id must be a unique, fully namespaced `vendor/model` slug
  // (a bare or duplicate id silently breaks routing / OpenRouter calls).
  const ids = CURATED_MODELS.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate curated model ids');
  for (const id of ids) {
    assert.match(id, /^[^/\s]+\/[^/\s]+/, `curated id must be namespaced vendor/model: ${id}`);
  }
});

test('buildInternetCatalogEntries merges OpenRouter + Gemini without selecting paid models', () => {
  const openRouter = new Map([
    ['vendor/free:free', { id: 'vendor/free:free', name: 'Free', pricing: { prompt: '0', completion: '0' }, context_length: 8192 }],
    ['vendor/paid', { id: 'vendor/paid', name: 'Paid', pricing: { prompt: '1', completion: '1' }, context_length: 8192 }],
  ]);
  const gemini = new Map([
    ['gemini-2.5-flash', { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', pricingKind: 'free-tier', provider: 'Google' }],
  ]);
  const entries = buildInternetCatalogEntries({ openRouter, gemini });
  assert.equal(entries.length, 3);
  assert.equal(entries.find((e) => e.id === 'vendor/paid')?.pricingKind, 'paid');
  assert.equal(entries.find((e) => e.id === 'gemini-2.5-flash')?.source, 'gemini');
  assert.equal(entries.find((e) => e.id === 'vendor/free:free')?.pricingKind, 'free');
});

test('discoverAnthropicFlagships reads the flagship from the LIVE catalogue, never a hardcoded id', () => {
  // A hardcoded slug is what broke the Coding Desk: the router picked a model id
  // that OpenRouter no longer lists, the call 404'd, and the turn fell back to a
  // cheap coder that truncated the build into a blank preview. The flagship must
  // come from whatever the catalogue actually lists today.
  const sec = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  const catalog = new Map([
    ['anthropic/claude-sonnet-5', { id: 'anthropic/claude-sonnet-5', name: 'Anthropic: Claude Sonnet 5', context_length: 1000000, created: sec('2026-07-01'), pricing: { prompt: '0.000002', completion: '0.00001' } }],
    ['anthropic/claude-opus-5', { id: 'anthropic/claude-opus-5', name: 'Anthropic: Claude Opus 5', context_length: 1000000, created: sec('2026-06-01'), pricing: { prompt: '0.000005', completion: '0.000025' } }],
    ['anthropic/claude-haiku-4.5', { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', context_length: 200000, created: sec('2025-10-01'), pricing: { prompt: '0.000001', completion: '0.000005' } }],
    ['vendor/claude-sonnet-clone:free', { id: 'vendor/claude-sonnet-clone:free', name: 'Clone', pricing: { prompt: '0', completion: '0' } }],
    ['qwen/qwen-2.5-coder-32b-instruct', { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen Coder', created: 1, pricing: { prompt: '0.0000001', completion: '0.0000001' } }],
  ]);

  const found = discoverAnthropicFlagships(catalog);
  assert.equal(found[0].id, 'anthropic/claude-sonnet-5', 'newest listed Sonnet/Opus leads');
  assert.ok(found.every((model) => model.pricingKind === 'paid'));
  assert.ok(!found.some((model) => /haiku/i.test(model.id)), 'haiku tier is not a flagship');
  assert.ok(!found.some((model) => model.id.includes('clone')), 'a free lookalike from another vendor is not Anthropic');
  assert.ok(!found.some((model) => model.id.includes('3.5')), 'nothing is hardcoded — only what the catalogue lists');
});

test('discoverAnthropicFlagships degrades safely when the catalogue is unavailable', () => {
  // Catalogue fetch failures must not throw on the chat path.
  assert.deepEqual(discoverAnthropicFlagships(null), []);
  assert.deepEqual(discoverAnthropicFlagships(new Map()), []);
});

test('no Anthropic model id is hardcoded in the curated catalogue', () => {
  // Regression guard: the curated list is where the stale claude-3.5-sonnet id
  // lived. Anthropic routes are discovered at runtime instead.
  assert.ok(!CURATED_MODELS.some((model) => /anthropic|claude/i.test(model.id)));
});
