import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBestFreeModel, classifyTask, rankFreeModels } from './model-routing.js';

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

test('general and fast requests prefer the free Gemini tier', () => {
  assert.equal(rankFreeModels(models, 'Hello, can you help me?')[0].id, 'gemini-flash-latest');
  assert.equal(rankFreeModels(models, 'Give me a quick short answer')[0].id, 'gemini-flash-latest');
});
