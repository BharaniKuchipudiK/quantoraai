import test from 'node:test';
import assert from 'node:assert/strict';
import { formatContext, isFreeModel, metadataFingerprint, providerFromId } from './model-catalog.js';

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
