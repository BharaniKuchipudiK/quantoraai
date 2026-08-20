import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPclPresentationDirectorPlan,
  compilePclPresentationBrief,
} from './pcl-presentation-director.js';

test('board strategy decisions route to the frontier non-Claude tier', () => {
  const plan = buildPclPresentationDirectorPlan({
    prompt: 'Create a Board strategy deck for our cloud transformation. Compare three options, recommend one, quantify only the investment facts I provide, and ask the Board to approve the preferred path.',
  });

  assert.equal(plan.archetype, 'strategy');
  assert.equal(plan.decisionOriented, true);
  assert.equal(plan.modelTier, 'frontier');
  assert.ok(plan.complexityScore >= 8);
  assert.equal(plan.modelCandidates[0].model, 'openai/gpt-5.6-sol');
  assert.equal(plan.modelCandidates.some((entry) => /claude/i.test(entry.model)), false);
  assert.equal(plan.communicationStandard, 'consulting');
});

test('routine internal presentation stays on the economy tier', () => {
  const plan = buildPclPresentationDirectorPlan({
    prompt: 'Create five simple slides for our internal team onboarding update covering roles, ways of working and next steps.',
  });

  assert.equal(plan.archetype, 'general');
  assert.equal(plan.modelTier, 'economy');
  assert.equal(plan.modelCandidates[0].model, 'gemini-3.6-flash');
  assert.ok(plan.complexityScore < 5);
});

test('CFO business case is recognized as a decision-oriented business case', () => {
  const plan = buildPclPresentationDirectorPlan({
    prompt: 'Prepare a CFO business case for a platform investment. Compare options, show the supplied cost and benefit evidence, recommend the preferred option and seek funding approval.',
  });

  assert.equal(plan.archetype, 'business_case');
  assert.equal(plan.decisionOriented, true);
  assert.match(plan.audience, /CFO/i);
  assert.ok(['balanced', 'frontier'].includes(plan.modelTier));
  assert.match(plan.purpose, /investment|approval/i);
});

test('free-first policy keeps the presentation director on Gemini only', () => {
  const plan = buildPclPresentationDirectorPlan({
    prompt: 'Create a Board strategy presentation with a recommendation and decision ask.',
    freeFirst: true,
  });

  assert.equal(plan.modelCandidates.length, 1);
  assert.deepEqual(plan.modelCandidates[0], {
    adapter: 'gemini',
    model: 'gemini-3.6-flash',
    role: 'free-tier-first',
  });
});

test('Anthropic is never selected unless explicitly allowed', () => {
  const withoutAnthropic = buildPclPresentationDirectorPlan({
    prompt: 'Create an executive strategy deck for Board approval with options, risks, investment implications and a recommendation.',
    allowAnthropic: false,
  });
  assert.equal(withoutAnthropic.modelCandidates.some((entry) => /anthropic|claude/i.test(`${entry.adapter} ${entry.model}`)), false);

  const withAnthropic = buildPclPresentationDirectorPlan({
    prompt: 'Create an executive strategy deck for Board approval with options, risks, investment implications and a recommendation.',
    allowAnthropic: true,
  });
  assert.equal(withAnthropic.modelCandidates.some((entry) => entry.model === 'claude-sonnet-5'), true);
});

test('compiled PCL brief preserves established context and forbids invented precision', () => {
  const { plan, text } = compilePclPresentationBrief({
    prompt: 'Prepare a CIO transformation roadmap for steering committee review.',
    sessionContext: {
      goal: 'Secure alignment on the transformation path.',
      understanding: 'The user wants an executive storyline rather than a technical architecture dump.',
      facts: [
        'The program has three workstreams.',
        'The supplied target date is March 2027.',
      ],
    },
  });

  assert.equal(plan.archetype, 'strategy');
  assert.match(text, /The program has three workstreams\./);
  assert.match(text, /March 2027/);
  assert.match(text, /Do not invent missing facts/i);
  assert.match(text, /takeaway/i);
});
