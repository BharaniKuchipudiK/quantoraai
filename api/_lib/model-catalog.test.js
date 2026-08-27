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

test('the picker surfaces a discovered flagship, not only the Auto router', () => {
  // The router could reach Claude on Auto while the picker never listed it,
  // because /api/models built its list from DIRECT_MODELS + CURATED_MODELS only
  // and Anthropic ids are deliberately not in CURATED_MODELS. Both paths must
  // read the same live source or the model is selectable by the platform and
  // invisible to the user.
  const sec = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  const catalog = new Map([
    ['anthropic/claude-sonnet-5', { id: 'anthropic/claude-sonnet-5', name: 'Anthropic: Claude Sonnet 5', context_length: 1000000, created: sec('2026-07-01'), pricing: { prompt: '0.000002', completion: '0.00001' } }],
  ]);
  const [flagship] = discoverAnthropicFlagships(catalog);
  assert.equal(flagship.id, 'anthropic/claude-sonnet-5');
  // Shape the picker relies on to render and enable a row.
  assert.equal(flagship.available, true);
  assert.equal(flagship.pricingKind, 'paid');
  assert.ok(flagship.name);
  assert.ok(flagship.contextWindow);
});

test('a discovered flagship carries the catalogue-declared vision capability', () => {
  // Routing grants vision from this flag. Without it an attached image filtered a
  // pinned OpenRouter model out of the plan — silently rerouting to Gemini, or
  // 503ing when no Gemini credential existed.
  const paid = { prompt: '0.000002', completion: '0.00001' };
  const catalog = new Map([
    ['anthropic/claude-sonnet-5', { id: 'anthropic/claude-sonnet-5', name: 'Sonnet 5', created: 2, pricing: paid, architecture: { input_modalities: ['text', 'image', 'file'] } }],
    ['anthropic/claude-opus-textonly', { id: 'anthropic/claude-opus-textonly', name: 'Text only', created: 1, pricing: paid, architecture: { input_modalities: ['text'] } }],
  ]);
  const found = discoverAnthropicFlagships(catalog);
  assert.equal(found.find((m) => m.id === 'anthropic/claude-sonnet-5').vision, true);
  assert.equal(found.find((m) => m.id === 'anthropic/claude-opus-textonly').vision, false);
});

test('flagship discovery keeps families distinct and excludes batch endpoints', () => {
  // Reported as "still no Sonnet": three Opus 5 variants (Fast, plain, batch)
  // filled all three slots and pushed Sonnet 5 out of the picker. A batch
  // endpoint is also asynchronous and cannot serve a streaming chat turn, so
  // offering it is offering a route that never replies.
  const paid = { prompt: '0.000005', completion: '0.000025' };
  const sec = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  const catalog = new Map([
    ['anthropic/claude-opus-5:fast', { id: 'anthropic/claude-opus-5:fast', name: 'Claude Opus 5 (Fast)', created: sec('2026-07-10'), pricing: paid }],
    ['anthropic/claude-opus-5', { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', created: sec('2026-07-09'), pricing: paid }],
    ['anthropic/claude-opus-5:batch', { id: 'anthropic/claude-opus-5:batch', name: 'Claude Opus 5 (batch)', created: sec('2026-07-08'), pricing: paid }],
    ['anthropic/claude-sonnet-5', { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', created: sec('2026-07-01'), pricing: paid }],
  ]);

  const found = discoverAnthropicFlagships(catalog);
  const ids = found.map((model) => model.id);
  assert.ok(ids.includes('anthropic/claude-sonnet-5'), 'Sonnet must not be crowded out by variants of another model');
  assert.ok(!ids.some((id) => /batch/i.test(id)), 'a batch endpoint cannot stream a chat turn');
  assert.equal(new Set(ids.map((id) => id.split(':')[0])).size, ids.length, 'one entry per family');
});
