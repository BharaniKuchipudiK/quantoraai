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

test('refine / probe-failure turns STAY on fast Gemini rather than a slow unproven free coder', () => {
  // Escalating a free-tier build to a queued *:free coder is what blew past the
  // 135s deadline and triggered the fake "proved on the desk". Gemini finishes.
  const refine = resolveCodingDeskModel({
    task: 'coding',
    message: 'Fix the preview',
    refineMode: true,
    availableModels: ACTIVE,
    allowPaid: false,
  });
  assert.equal(refine.modelId, 'gemini-flash-latest');
  assert.equal(refine.escalated, false);
  assert.equal(refine.reason, 'stay_gemini_unproven_free');

  const probe = resolveCodingDeskModel({
    task: 'coding',
    message: 'try again',
    availableModels: ACTIVE,
    qualityHints: { probeFailure: true },
    allowPaid: false,
  });
  assert.equal(probe.modelId, 'gemini-flash-latest');
});

test('complex asks still flag escalation, but stay on Gemini without a paid coder', () => {
  assert.equal(shouldEscalateCodingDeskModel({
    message: 'Design the architecture for a multi-file production app',
  }), true);
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Design the architecture for a multi-file production app',
    availableModels: ACTIVE,
    allowPaid: false,
  });
  // No paid coder and no proven free coder → the fast reliable default wins.
  assert.equal(choice.modelId, 'gemini-flash-latest');
  assert.equal(choice.escalated, false);
});

test('shop / e-commerce builds stay on the fast reliable default, not a slow free coder', () => {
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
  // The shop build now runs on Gemini (fast, finishes in time, writes the real
  // rich page) instead of escalating to a free coder that times out.
  assert.equal(choice.modelId, 'gemini-flash-latest');
  // A plain brochure/portfolio ask still stays on the fast default.
  assert.equal(shouldEscalateCodingDeskModel({ message: 'build a simple about page' }), false);
});

test('a free coder that has EARNED it on measured outcomes is still escalated to', () => {
  const withProven = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
    {
      id: 'proven/coder:free',
      name: 'Proven Coder',
      available: true,
      pricingKind: 'free',
      specialty: 'coder',
      quality: { sampleSize: 50, score: 0.9 },
    },
  ];
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'build a shop website for my coffee shop',
    availableModels: withProven,
    allowPaid: false,
  });
  assert.equal(choice.modelId, 'proven/coder:free');
  assert.equal(choice.escalated, true);
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
  // good/coder-approved is an approved but UNPROVEN free model — a refine turn
  // keeps the fast Gemini default rather than escalating to it (it must earn the
  // escalation on measured outcomes first).
  const escalate = resolveCodingDeskModel({
    task: 'coding',
    refineMode: true,
    availableModels: models,
    allowPaid: false,
  });
  assert.equal(escalate.modelId, 'gemini-flash-latest');
  assert.equal(escalate.escalated, false);
});
