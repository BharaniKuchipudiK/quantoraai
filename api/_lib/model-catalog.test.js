import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_MODELS,
  buildInternetCatalogEntries,
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
