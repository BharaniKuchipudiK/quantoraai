import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLATFORM_SKILLS,
  getPlatformSkill,
  platformSkillAssignment,
  routePlatformSkill,
} from './platform-skill-registry.js';

test('every platform Skill is versioned and cannot own completion truth', () => {
  const entries = Object.values(PLATFORM_SKILLS);
  assert.ok(entries.length >= 10, 'the foundation should cover the initial cross-workspace catalogue');
  for (const skill of entries) {
    assert.match(skill.skillId, /^[a-z]+\.[a-z0-9-]+$/);
    assert.match(skill.version, /^\d+\.\d+\.\d+$/);
    assert.equal(skill.completionAuthority, 'runtime-governor');
    assert.equal(skill.verificationAuthority, 'outcome-evaluator');
    assert.ok(Array.isArray(skill.completionContract) && skill.completionContract.length > 0);
    assert.ok(Array.isArray(skill.progressVocabulary) && skill.progressVocabulary.length > 0);
  }
});

test('Coding website/app work deterministically assigns the Senior Web Product Engineer', () => {
  const skill = routePlatformSkill({ workspace: 'coding', intentKind: 'app_build', message: 'Build my tutoring website.' });
  assert.equal(skill?.skillId, 'coding.senior-web-product-engineer');
  assert.equal(skill?.version, '1.0.0');

  const shop = routePlatformSkill({ workspace: 'coding', intentKind: 'shop_build', message: 'Build an online shop.' });
  assert.equal(shop?.skillId, 'coding.senior-web-product-engineer');
});

test('failure-shaped desk refinements route to the Debugger & Recovery Engineer', () => {
  const debug = routePlatformSkill({
    workspace: 'coding',
    intentKind: 'refine_desk',
    message: 'Fix the broken checkout; the browser crashes on submit.',
  });
  assert.equal(debug?.skillId, 'coding.debugger-recovery-engineer');

  const normal = routePlatformSkill({
    workspace: 'coding',
    intentKind: 'refine_desk',
    message: 'Change the hero heading and spacing.',
  });
  assert.equal(normal?.skillId, 'coding.senior-web-product-engineer');
});

test('assignments are bounded metadata, not a second completion authority', () => {
  const assignment = platformSkillAssignment({ workspace: 'coding', intentKind: 'app_build' });
  assert.deepEqual(Object.keys(assignment).sort(), [
    'completionAuthority',
    'completionContract',
    'deliveryPolicy',
    'name',
    'progressVocabulary',
    'requiredPermissions',
    'routeReason',
    'skillId',
    'verificationAuthority',
    'version',
    'workspace',
  ].sort());
  assert.equal(assignment.completionAuthority, 'runtime-governor');
  assert.equal(assignment.verificationAuthority, 'outcome-evaluator');
  assert.equal(assignment.deliveryPolicy.requiresApproval, true);
  assert.ok(assignment.requiredPermissions.includes('external.delivery'));
});

test('unknown work does not invent a Skill assignment', () => {
  assert.equal(routePlatformSkill({ workspace: 'coding', intentKind: 'python_build' }), null);
  assert.equal(routePlatformSkill({ workspace: 'unknown', intentKind: 'app_build' }), null);
  assert.equal(getPlatformSkill('does.not-exist'), null);
});
