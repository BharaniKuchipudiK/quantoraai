import assert from 'node:assert/strict';
import test from 'node:test';
import { planCodingTurn, CODING_SKILLS } from './coding-turn-planner.js';

const FOX = 'Build a full Fox & Wolf kids merchandise shop website with 100 unique design images, product pages, and checkout.';

test('declarative oversize shop ask still interrupts without a build verb', () => {
  const plan = planCodingTurn({
    message: 'I need an online shop with 100 unique product images and checkout',
    codingDeskOpen: false,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.mode, 'interrupt');
  assert.equal(plan.feasible, false);
  assert.ok(plan.skillsMissing.some((s) => s.id === 'unique_ai_mockups_at_scale'));
});

test('oversize shop ask interrupts with missing skill named — no execute', () => {
  const plan = planCodingTurn({
    message: FOX,
    codingDeskOpen: true,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.mode, 'interrupt');
  assert.equal(plan.feasible, false);
  assert.ok(plan.skillsMissing.some((s) => s.id === 'unique_ai_mockups_at_scale'));
  assert.equal(CODING_SKILLS.unique_ai_mockups_at_scale.available, false);
  assert.match(plan.interrupt.reply, /Hold on|Proposal|Agree/i);
  assert.match(plan.statusLabel, /Waiting for your agree/i);
  assert.equal(plan.modelPlan, null);
});

test('agree start with 10 executes with proof plan and honest status', () => {
  const plan = planCodingTurn({
    message: 'start with 10',
    priorUserMessages: [FOX],
    codingDeskOpen: true,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.mode, 'execute');
  assert.equal(plan.feasible, true);
  assert.equal(plan.skillsMissing.length, 0);
  assert.match(plan.messageForModel, /about 10 working catalog photos/i);
  assert.match(plan.statusLabel, /~10 catalog photos|about 10/i);
  assert.equal(plan.runSkillsFirst, true);
  assert.ok(plan.proof.mustHave.some((item) => /photo/i.test(item)));
  assert.ok(plan.modelPlan?.modelId);
});

test('ordinary calculator build is feasible execute with preview proof', () => {
  const plan = planCodingTurn({
    message: 'Build a working calculator with number buttons',
    codingDeskOpen: true,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.mode, 'execute');
  assert.ok(plan.skillsRequired.some((s) => s.id === 'preview_html'));
  assert.ok(plan.proof.mustHave.some((item) => /Preview/i.test(item)));
});

test('explicit Python bundle plans native execution proof without demanding a fake web preview', () => {
  const plan = planCodingTurn({
    message: 'Create three files: parser.py, test_parser.py and README.md.',
    codingDeskOpen: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.mode, 'execute');
  assert.equal(plan.intent.kind, 'python_build');
  assert.ok(plan.skillsRequired.some((s) => s.id === 'python_runtime'));
  assert.ok(!plan.skillsRequired.some((s) => s.id === 'preview_html'));
  assert.ok(plan.proof.mustHave.some((item) => /Python execution evidence/i.test(item)));
});

test('non-coding advisor turns pass through without planner interrupt', () => {
  const plan = planCodingTurn({
    message: 'What is the capital of France?',
    codingDeskOpen: false,
    studioDomain: 'research',
  });
  assert.equal(plan.mode, 'pass');
  assert.equal(plan.isCodingTurn, false);
});

test('prior timeout_shop lesson reinforces interrupt on oversize ask', () => {
  const plan = planCodingTurn({
    message: FOX,
    codingDeskOpen: true,
    lessons: [{ kind: 'timeout_shop', at: Date.now() }],
  });
  assert.equal(plan.mode, 'interrupt');
  assert.match(plan.statusLabel, /Learned from timeout_shop/i);
  assert.equal(plan.hints.reinforceInterrupt, true);
});

test('svg_only lesson prefers deterministic shop skills on agree', () => {
  const plan = planCodingTurn({
    message: 'start with 10',
    priorUserMessages: [FOX],
    codingDeskOpen: true,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
    lessons: [{ kind: 'svg_only_desk', at: Date.now() }],
  });
  assert.equal(plan.mode, 'execute');
  assert.equal(plan.runSkillsFirst, true);
  assert.equal(plan.hints.preferDeterministicShopSkills, true);
});

/*
 * The capability-door tests that lived here are gone with the code they
 * covered. They passed while no production caller ever supplied the options
 * they exercised, which made them a green light over a path users could never
 * reach. The doors are now tested where they are actually used, against the
 * gateway that knows a capability is missing.
 */
