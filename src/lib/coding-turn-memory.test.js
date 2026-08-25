import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonsToPlannerHints } from './coding-turn-memory.js';
import { lessonKindFromOutcome } from './coding-turn-lesson-kinds.js';

test('lessons map to planner hints', () => {
  const hints = lessonsToPlannerHints([
    { kind: 'svg_only_desk' },
    { kind: 'timeout_shop' },
    { kind: 'provider_dead' },
  ]);
  assert.equal(hints.preferDeterministicShopSkills, true);
  assert.equal(hints.escalateModel, true);
  assert.equal(hints.reinforceInterrupt, true);
  assert.equal(hints.lastLesson.kind, 'svg_only_desk');
});

test('outcome kinds map to lesson kinds', () => {
  assert.equal(lessonKindFromOutcome({ outcomeKind: 'timeout', isShopPhotoTurn: true }), 'timeout_shop');
  assert.equal(lessonKindFromOutcome({ outcomeKind: 'provider-dead' }), 'provider_dead');
  assert.equal(lessonKindFromOutcome({ outcomeKind: 'svg_only' }), 'svg_only_desk');
  assert.equal(lessonKindFromOutcome({ outcomeKind: 'no-preview' }), 'empty_photos');
});
