import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBestFreeModel, chooseBestDeckModel, classifyTask, rankFreeModels } from './model-routing.js';

const models = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier', specialty: 'Fast multimodal chat' },
  { id: 'nvidia/nemotron-3-super:free', name: 'Nemotron 3 Super', available: true, pricingKind: 'free', specialty: 'Reasoning and coding' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', available: true, pricingKind: 'paid' },
];

test('classifies practical user tasks without an external model call', () => {
  assert.equal(classifyTask('Debug this React API error'), 'coding');
  assert.equal(classifyTask('Compare these two architectures'), 'research');
  assert.equal(classifyTask('Write a friendly email'), 'writing');
});

test('auto select never chooses a paid or unavailable model', () => {
  const choice = chooseBestFreeModel(models, 'Build a React application');
  assert.equal(choice.model.id, 'nvidia/nemotron-3-super:free');
  assert.equal(choice.task, 'coding');
});

test('deck routing picks the strongest design model over a fast flash model', () => {
  const deckModels = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
    { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', available: true, pricingKind: 'paid' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', available: true, pricingKind: 'paid' },
  ];
  assert.equal(chooseBestDeckModel(deckModels).id, 'anthropic/claude-sonnet');
});

test('deck routing skips unavailable models and tolerates empty input', () => {
  assert.equal(chooseBestDeckModel([]), null);
  const only = [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' }];
  assert.equal(chooseBestDeckModel(only).id, 'gemini-flash-latest'); // best available, even if weak
});

test('general and fast requests prefer a qualified non-Gemini free route', () => {
  assert.equal(rankFreeModels(models, 'Hello, can you help me?')[0].id, 'nvidia/nemotron-3-super:free');
  assert.equal(rankFreeModels(models, 'Give me a quick short answer')[0].id, 'nvidia/nemotron-3-super:free');
  assert.ok(rankFreeModels(models, 'Hello, can you help me?').some((model) => model.id === 'gemini-flash-latest'));
});
