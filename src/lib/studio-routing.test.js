import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioRoutingNote, resolveStudioRouting } from './studio-routing.js';

const models = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier', specialty: 'Fast multimodal chat' },
  { id: 'nvidia/nemotron-3-super:free', name: 'Nemotron 3 Super', available: true, pricingKind: 'free', specialty: 'Reasoning and coding' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', available: true, pricingKind: 'paid' },
];

test('resolveStudioRouting prefers the ranked free coding model when auto-select is enabled', () => {
  const result = resolveStudioRouting({
    availableModels: models,
    visibleText: 'Build a React application with API integration',
    selectedModel: null,
    autoSelectEnabled: true,
    arenaPrefs: null,
    pendingImages: [],
  });

  assert.equal(result.taskCategory, 'coding');
  assert.equal(result.targetModel.id, 'nvidia/nemotron-3-super:free');
  assert.equal(result.autoChoice?.model?.id, 'nvidia/nemotron-3-super:free');
  assert.ok(result.rankedFreeFallbacks.every((model) => model.id !== result.targetModel.id));
});

test('resolveStudioRouting preserves explicit selected model when auto-select is off', () => {
  const selectedModel = { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', available: true, pricingKind: 'paid' };
  const result = resolveStudioRouting({
    availableModels: models,
    visibleText: 'Help me think through this product decision',
    selectedModel,
    autoSelectEnabled: false,
    arenaPrefs: null,
    pendingImages: [],
  });

  assert.equal(result.taskCategory, 'general');
  assert.equal(result.targetModel.id, selectedModel.id);
  assert.equal(result.autoChoice, null);
});

test('resolveStudioRouting forces vision task classification when images are attached', () => {
  const result = resolveStudioRouting({
    availableModels: models,
    visibleText: 'What do you see in this screenshot?',
    selectedModel: null,
    autoSelectEnabled: true,
    arenaPrefs: null,
    pendingImages: [{ type: 'image' }],
  });

  assert.equal(result.taskCategory, 'vision');
});

test('buildStudioRoutingNote returns a human-readable explanation only for auto-routed choices', () => {
  assert.equal(
    buildStudioRoutingNote({
      autoChoice: { model: { id: 'gemini-flash-latest' }, reason: 'it is the best balanced free option currently ready' },
      targetModel: { name: 'Gemini Flash' },
    }),
    'Quantora chose Gemini Flash because it is the best balanced free option currently ready.',
  );

  assert.equal(
    buildStudioRoutingNote({
      autoChoice: null,
      targetModel: { name: 'Gemini Flash' },
    }),
    null,
  );
});
