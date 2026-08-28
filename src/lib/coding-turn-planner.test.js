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
 * Phase 03 in the planner: a shut door interrupts with a way through, and a
 * wall still refuses.
 */

function planWith(extra) {
  return planCodingTurn({
    message: 'build me a notes page',
    codingDeskOpen: true,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
    ...extra,
  });
}

test('a shut door interrupts with steps instead of burning a model turn', () => {
  const plan = planWith({ capabilitiesNeeded: ['market_data'] });
  assert.equal(plan.mode, 'interrupt');
  assert.equal(plan.interrupt.kind, 'capability-door');
  assert.deepEqual(plan.interrupt.doors, ['market_data']);
  assert.match(plan.interrupt.reply, /^1\. /m, 'numbered steps');
  assert.match(plan.interrupt.reply, /You'll know it worked/);
  assert.match(plan.statusLabel, /not burning a model turn/);
});

test('the ask is parked so the user never retypes it', () => {
  const plan = planWith({ message: 'build a page that converts 100 USD to INR', capabilitiesNeeded: ['market_data'] });
  assert.equal(plan.interrupt.pendingAsk.ask, 'build a page that converts 100 USD to INR');
  assert.deepEqual(plan.interrupt.pendingAsk.waitingOn, ['market_data']);
});

test('an open door does not interrupt at all', () => {
  const plan = planWith({ capabilitiesNeeded: ['market_data'], capabilities: { market_data: true } });
  assert.equal(plan.mode, 'execute');
  assert.equal(plan.interrupt, null);
});

test('INVARIANT: a capability nobody built is a wall, never a door', () => {
  // Offering steps for something that will never exist sends somebody hunting
  // for a handle that is not there — crueller than the dead end it replaced.
  const plan = planWith({ capabilitiesNeeded: ['unique_ai_mockups_at_scale'] });
  assert.notEqual(plan.interrupt?.kind, 'capability-door');
});

test('a turn needing nothing extra is unaffected by the door check', () => {
  const plan = planWith({});
  assert.equal(plan.mode, 'execute');
  assert.equal(plan.interrupt, null);
});

test('a non-coding turn is never gated on a build capability', () => {
  // The pass-through returns before the door check, and should: a chat turn is
  // not a build, and asking somebody to configure Supabase to answer a question
  // would be an obstacle invented out of nothing.
  const plan = planCodingTurn({ message: 'what do you think of this?', capabilitiesNeeded: ['market_data'] });
  assert.equal(plan.mode, 'pass');
  assert.equal(plan.interrupt, null);
});
