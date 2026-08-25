import test from 'node:test';
import assert from 'node:assert/strict';
import { selectModelsForTurn } from './select-models.js';

const MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', available: true, pricingKind: 'free', specialty: 'coding' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen Coder', available: true, pricingKind: 'paid', specialty: 'Code Synthesis' },
];

test('pinned model stays explicit and is not replaced by Auto', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Design the architecture for a multi-file app',
    explicitModelId: 'gemini-flash-latest',
    buildMode: true,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.equal(decision.selectionSource, 'explicit');
});

test('Auto coding turns default to Gemini', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Build a calculator',
    explicitModelId: 'auto',
    buildMode: true,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.equal(decision.selectionSource, 'coding_desk_auto');
  assert.equal(decision.reason, 'build');
  assert.ok(decision.fallbackModelIds.includes('deepseek/deepseek-chat'));
});

test('Auto coding refine escalates without picking paid when allowPaid is false', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'fix the preview',
    explicitModelId: 'auto',
    buildMode: true,
    refineMode: true,
    allowPaid: false,
  });
  assert.equal(decision.primaryModelId, 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(decision.selectionSource, 'coding_desk_auto');
  assert.ok(decision.fallbackModelIds.includes('gemini-flash-latest'));
});

test('Auto escalate with empty Active list still keeps Gemini last-resort fallback', () => {
  const decision = selectModelsForTurn({
    models: [],
    message: 'Refactor the entire multi-file architecture',
    explicitModelId: 'auto',
    buildMode: true,
    hasVFS: true,
    qualityHints: { fileCount: 12 },
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.equal(decision.selectionSource, 'coding_desk_auto');
  assert.ok(decision.fallbackModelIds.includes('deepseek/deepseek-chat'));
});

test('null modelId on a coding turn uses Coding Desk Auto', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Add a login form',
    explicitModelId: null,
    taskCategory: 'coding',
  });
  assert.equal(decision.selectionSource, 'coding_desk_auto');
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
});

test('Travel/research non-build Auto stays on ranked free routing', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Compare these two investment strategies',
    explicitModelId: 'auto',
    studioMode: 'ask',
    taskCategory: 'research',
  });
  assert.notEqual(decision.selectionSource, 'coding_desk_auto');
});
