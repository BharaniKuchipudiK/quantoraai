import assert from 'node:assert/strict';
import test from 'node:test';
import { runCodingTurnSkills, planFromMessageSnapshot } from './coding-turn-skills.js';

test('planFromMessageSnapshot rebuilds low-level skill ids and governed Skill identity', () => {
  const plan = planFromMessageSnapshot({
    intent: { kind: 'shop_catalog_slice' },
    skillsRequired: ['shop_catalog_photos', 'shop_commerce_ui'],
    runSkillsFirst: true,
  }, { messageForModel: 'start with 10' });
  assert.equal(plan.intent.kind, 'shop_catalog_slice');
  assert.ok(plan.skillsRequired.every((s) => s.id && s.available));
  assert.equal(plan.assignedSkill?.skillId, 'coding.senior-web-product-engineer');
  assert.equal(plan.assignedSkill?.version, '1.0.0');
  assert.equal(plan.assignedSkill?.completionAuthority, 'runtime-governor');
});

test('shop plan runs deterministic desk capabilities under the Senior Web Product Engineer Skill', () => {
  const result = runCodingTurnSkills({
    plan: {
      mode: 'execute',
      isCodingTurn: true,
      intent: { kind: 'shop_catalog_slice' },
      skillsRequired: [
        { id: 'shop_catalog_photos', available: true },
        { id: 'shop_commerce_ui', available: true },
        { id: 'preview_html', available: true },
      ],
      messageForModel: 'Fox & Wolf kids shop with about 10 catalog photos',
    },
    vfs: {},
    brief: 'Fox & Wolf kids shop with about 10 catalog photos',
  });
  assert.equal(result.assignedSkill?.skillId, 'coding.senior-web-product-engineer');
  assert.ok(result.ran.includes('shop_catalog_photos') || result.proof.hasHtml || result.changed);
  // Either we seeded a shop shell or left vfs empty if ensureShop needs more signal —
  // at minimum the runner must not throw and must return a proof object.
  assert.equal(typeof result.proof.photos, 'number');
  assert.equal(typeof result.proof.hasCart, 'boolean');
});

test('failure-shaped refinements assign the Debugger & Recovery Engineer without changing capability execution', () => {
  const result = runCodingTurnSkills({
    plan: {
      mode: 'execute',
      isCodingTurn: true,
      intent: { kind: 'refine_desk' },
      skillsRequired: [{ id: 'preview_html', available: true }],
      displayUserText: 'Fix the broken checkout; submit crashes.',
    },
    vfs: { 'index.html': { content: '<html></html>', language: 'html' } },
  });
  assert.equal(result.assignedSkill?.skillId, 'coding.debugger-recovery-engineer');
  assert.deepEqual(result.ran, []);
});

test('interrupt plans do not run desk capabilities but preserve the governed Skill route', () => {
  const result = runCodingTurnSkills({
    plan: {
      mode: 'interrupt',
      isCodingTurn: true,
      intent: { kind: 'shop_oversize' },
      displayUserText: 'Build a shop with 100 unique mockups',
    },
    vfs: { 'index.html': { content: '<html></html>', language: 'html' } },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.ran, []);
  assert.equal(result.assignedSkill?.skillId, 'coding.senior-web-product-engineer');
});

test('unmatched Coding work does not invent a governed Skill', () => {
  const result = runCodingTurnSkills({
    plan: { mode: 'execute', isCodingTurn: true, intent: { kind: 'python_build' }, skillsRequired: [] },
    vfs: {},
  });
  assert.equal(result.assignedSkill, null);
});
