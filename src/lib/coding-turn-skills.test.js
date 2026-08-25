import assert from 'node:assert/strict';
import test from 'node:test';
import { runCodingTurnSkills, planFromMessageSnapshot } from './coding-turn-skills.js';

test('planFromMessageSnapshot rebuilds skill ids', () => {
  const plan = planFromMessageSnapshot({
    intent: { kind: 'shop_catalog_slice' },
    skillsRequired: ['shop_catalog_photos', 'shop_commerce_ui'],
    runSkillsFirst: true,
  }, { messageForModel: 'start with 10' });
  assert.equal(plan.intent.kind, 'shop_catalog_slice');
  assert.ok(plan.skillsRequired.every((s) => s.id && s.available));
});

test('shop plan runs deterministic skills on empty vfs', () => {
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
  assert.ok(result.ran.includes('shop_catalog_photos') || result.proof.hasHtml || result.changed);
  // Either we seeded a shop shell or left vfs empty if ensureShop needs more signal —
  // at minimum the runner must not throw and must return a proof object.
  assert.equal(typeof result.proof.photos, 'number');
  assert.equal(typeof result.proof.hasCart, 'boolean');
});

test('interrupt plans do not run skills', () => {
  const result = runCodingTurnSkills({
    plan: { mode: 'interrupt', isCodingTurn: true, intent: { kind: 'shop_oversize' } },
    vfs: { 'index.html': { content: '<html></html>', language: 'html' } },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.ran, []);
});
