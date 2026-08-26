import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFreeBodyScene,
  isFreeBodyDiagramRelevant,
  validateFreeBodyScene,
} from './study-free-body-diagram.js';

test('FBD relevance is limited to physics and force-related topics', () => {
  assert.equal(isFreeBodyDiagramRelevant({ topic: 'Newton laws', subjects: [] }), true);
  assert.equal(isFreeBodyDiagramRelevant({ topic: 'Cell division', subjects: ['Botany'] }), false);
  assert.equal(isFreeBodyDiagramRelevant({ topic: 'Vectors', subjects: ['Physics'] }), true);
});
test('default FBD has equal and opposite vertical forces and no velocity arrow', () => {
  const scene = buildFreeBodyScene();
  assert.deepEqual(scene.forces.map((force) => force.id), ['normal', 'weight']);
  assert.deepEqual(validateFreeBodyScene(scene), { valid: true, issues: [] });
  assert.equal(JSON.stringify(scene).toLowerCase().includes('velocity'), false);
});

test('applied force and friction are explicit opposing force arrows', () => {
  const scene = buildFreeBodyScene({ applied: true, friction: true });
  assert.deepEqual(scene.forces.map((force) => force.id), ['normal', 'weight', 'applied', 'friction']);
  assert.deepEqual(validateFreeBodyScene(scene), { valid: true, issues: [] });
  assert.equal(scene.forces.find((force) => force.id === 'applied').x2, 235);
  assert.equal(scene.forces.find((force) => force.id === 'friction').x2, 85);
});
