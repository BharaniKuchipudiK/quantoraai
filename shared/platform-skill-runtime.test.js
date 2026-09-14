import assert from 'node:assert/strict';
import test from 'node:test';
import {
  platformSkillAssignmentForCodingGoal,
  platformSkillBindingForCodingGoal,
  platformSkillObjectiveForCodingGoal,
  resolvePlatformSkillBinding,
} from './platform-skill-runtime.js';

test('website and app goals bind the Senior Web Product Engineer', () => {
  for (const goal of [
    'Build a responsive website for my tutoring business',
    'Create a SaaS landing page and launch-ready frontend',
    'Make an online shop with a working cart',
    'Build a calculator app with a polished UI',
  ]) {
    const assignment = platformSkillAssignmentForCodingGoal(goal);
    assert.equal(assignment?.skillId, 'coding.senior-web-product-engineer', goal);
    assert.equal(assignment?.version, '1.0.0', goal);
  }
});

test('failure-shaped work binds the recovery specialist and reviews bind the reviewer', () => {
  assert.equal(
    platformSkillAssignmentForCodingGoal('Fix the broken checkout page; the browser test is failing')?.skillId,
    'coding.debugger-recovery-engineer',
  );
  assert.equal(
    platformSkillAssignmentForCodingGoal('Review this pull request for meaningful defects')?.skillId,
    'coding.code-reviewer',
  );
});

test('unknown and non-web Python work fail closed to no platform Skill', () => {
  assert.equal(platformSkillAssignmentForCodingGoal('Write report.py and run pytest'), null);
  assert.equal(platformSkillAssignmentForCodingGoal('Explain what this algorithm does'), null);
});

test('durable binding is only skill id plus version and resolves through the trusted registry', () => {
  const binding = platformSkillBindingForCodingGoal('Build a portfolio website');
  assert.deepEqual(binding, { skillId: 'coding.senior-web-product-engineer', version: '1.0.0' });
  assert.equal(resolvePlatformSkillBinding(binding)?.name, 'Senior Web Product Engineer');
  assert.equal(resolvePlatformSkillBinding({ ...binding, version: '0.0.0' }), null);
  assert.equal(resolvePlatformSkillBinding({ skillId: 'coding.fake', version: '1.0.0' }), null);
});

test('server objective carries trusted workflow and completion policy without changing the original ask', () => {
  const goal = 'Build a website for my photography business';
  const objective = platformSkillObjectiveForCodingGoal(goal);
  assert.match(objective, new RegExp(goal));
  assert.match(objective, /GOVERNED SKILL: Senior Web Product Engineer/);
  assert.match(objective, /requirements → plan → build → verify → recover → deliver → prove/);
  assert.match(objective, /requested product behavior exists/);
  assert.match(objective, /runtime-governor/);
  assert.match(objective, /outcome-evaluator/);
  assert.match(objective, /Generated code alone is not completion/);
});
