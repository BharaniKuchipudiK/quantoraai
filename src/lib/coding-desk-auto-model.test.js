import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODING_DESK_AUTO_MODEL_ID,
  activeModelsForRouting,
  isCodingDeskAutoSelection,
  resolveCodingDeskModel,
  shouldEscalateCodingDeskModel,
} from './coding-desk-auto-model.js';

const ACTIVE = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier', specialty: 'Fast multimodal' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', available: true, pricingKind: 'free', specialty: 'Reasoning and coding' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', available: true, pricingKind: 'paid', specialty: 'Code Synthesis' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', available: true, pricingKind: 'paid', specialty: 'General' },
];

test('Auto sentinel is recognized for null, empty, and auto id', () => {
  assert.equal(isCodingDeskAutoSelection(null), true);
  assert.equal(isCodingDeskAutoSelection({ id: CODING_DESK_AUTO_MODEL_ID }), true);
  assert.equal(isCodingDeskAutoSelection('auto'), true);
  assert.equal(isCodingDeskAutoSelection({ id: 'gemini-flash-latest' }), false);
});

test('ordinary coding turns stay on Gemini', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Build a simple todo list with React',
    availableModels: ACTIVE,
  });
  assert.equal(choice.modelId, 'gemini-flash-latest');
  assert.equal(choice.escalated, false);
  assert.equal(choice.reason, 'default_gemini');
});

test('refine / probe-failure turns escalate to the best free coding model', () => {
  const refine = resolveCodingDeskModel({
    task: 'coding',
    message: 'Fix the preview',
    refineMode: true,
    availableModels: ACTIVE,
    allowPaid: false,
  });
  assert.equal(refine.modelId, 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(refine.escalated, true);

  const probe = resolveCodingDeskModel({
    task: 'coding',
    message: 'try again',
    availableModels: ACTIVE,
    qualityHints: { probeFailure: true },
    allowPaid: false,
  });
  assert.equal(probe.modelId, 'nvidia/nemotron-3-super-120b-a12b:free');
});

test('complex architecture asks escalate once at request start', () => {
  assert.equal(shouldEscalateCodingDeskModel({
    message: 'Design the architecture for a multi-file production app',
  }), true);
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Design the architecture for a multi-file production app',
    availableModels: ACTIVE,
    allowPaid: false,
  });
  assert.equal(choice.escalated, true);
  assert.equal(choice.modelId, 'nvidia/nemotron-3-super-120b-a12b:free');
});

test('shop / e-commerce builds escalate off the weak default model', () => {
  for (const message of [
    'build a shop website for my coffee shop',
    'create an online store to sell my sarees',
    'make an e-commerce site with a product catalog',
  ]) {
    assert.equal(shouldEscalateCodingDeskModel({ message }), true, message);
  }
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'build a shop website for my coffee shop',
    availableModels: ACTIVE,
    allowPaid: false,
  });
  assert.equal(choice.escalated, true);
  assert.notEqual(choice.modelId, 'gemini-flash-latest');
  // A plain brochure/portfolio ask still stays on the fast default.
  assert.equal(shouldEscalateCodingDeskModel({ message: 'build a simple about page' }), false);
});

test('free Studio without keys never auto-picks paid-only models', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Refactor the entire codebase architecture',
    availableModels: ACTIVE,
    allowPaid: false,
  });
  assert.notEqual(choice.modelId, 'qwen/qwen-2.5-coder-32b-instruct');
  assert.equal(ACTIVE.find((m) => m.id === choice.modelId)?.pricingKind === 'paid', false);
});

test('BYOK may escalate to a paid coding specialist already in Active', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Refactor the entire codebase architecture',
    availableModels: ACTIVE,
    allowPaid: true,
  });
  assert.equal(choice.modelId, 'qwen/qwen-2.5-coder-32b-instruct');
  assert.equal(choice.escalated, true);
});

test('unavailable stronger models fall back to Gemini instead of inventing ids', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    refineMode: true,
    message: 'fix it',
    availableModels: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen', available: false, pricingKind: 'paid' },
    ],
    allowPaid: true,
  });
  assert.equal(choice.modelId, 'gemini-flash-latest');
  assert.equal(choice.escalated, false);
});

test('large VFS multi-file signal escalates', () => {
  assert.equal(shouldEscalateCodingDeskModel({
    message: 'update styles',
    hasVFS: true,
    qualityHints: { fileCount: 8 },
  }), true);
});

test('activeModelsForRouting keeps featured models and drops unapproved registry rows', () => {
  const models = activeModelsForRouting({
    featuredModels: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
    ],
    registryRows: [
      { id: 'evil/coder-unapproved', name: 'Evil Coder', approved: false, lifecycle: 'discovered', is_free: true },
      { id: 'good/coder-approved', name: 'Good Coder', approved: true, lifecycle: 'available', is_free: true },
      { id: 'gone/coder', name: 'Retired', approved: true, lifecycle: 'retired', is_free: true },
    ],
  });
  const ids = models.map((m) => m.id);
  assert.ok(ids.includes('gemini-flash-latest'));
  assert.ok(ids.includes('good/coder-approved'));
  assert.equal(ids.includes('evil/coder-unapproved'), false);
  assert.equal(ids.includes('gone/coder'), false);
  const escalate = resolveCodingDeskModel({
    task: 'coding',
    refineMode: true,
    availableModels: models,
    allowPaid: false,
  });
  assert.equal(escalate.modelId, 'good/coder-approved');
});
