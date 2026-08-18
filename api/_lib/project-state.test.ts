import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT_ID, normalizeProjectId, normalizeProjectInput, normalizeProjectResources } from './project-state.js';

test('project ids are bounded and compatible with the existing default workspace', () => {
  assert.equal(normalizeProjectId(DEFAULT_PROJECT_ID), DEFAULT_PROJECT_ID);
  assert.equal(normalizeProjectId('project-550e8400-e29b-41d4-a716-446655440000'), 'project-550e8400-e29b-41d4-a716-446655440000');
  assert.equal(normalizeProjectId('../other-user'), null);
  assert.equal(normalizeProjectId(''), null);
});

test('project normalization is bounded and preserves optimistic version state', () => {
  const project = normalizeProjectInput({
    id: 'project-test',
    version: 7,
    name: '  Cloud Modernization  ',
    description: 'Decision workspace',
    goal: 'Approve Phase 1',
    status: 'paused',
    color: '#123456',
  });
  assert.ok(project);
  assert.equal(project.name, 'Cloud Modernization');
  assert.equal(project.version, 7);
  assert.equal(project.status, 'paused');
  assert.equal(project.goal, 'Approve Phase 1');
});

test('invalid project status falls back safely and empty names are rejected', () => {
  assert.equal(normalizeProjectInput({ id: 'project-test', name: '' }), null);
  const project = normalizeProjectInput({ id: 'project-test', name: 'Test', status: 'deleted' });
  assert.equal(project?.status, 'active');
});

test('project resource sync is bounded and de-duplicates the same kind/ref', () => {
  const resources = normalizeProjectResources([
    { kind: 'office-presentation', ref: 'fingerprint-1', title: 'Deck.pptx', metadata: { sessionId: 's1' } },
    { kind: 'office-presentation', ref: 'fingerprint-1', title: 'Duplicate.pptx' },
    { kind: 'workspace', ref: 'message:s1:2', title: 'App' },
  ]);
  assert.equal(resources.length, 2);
  assert.equal(resources[0].title, 'Deck.pptx');
  assert.deepEqual(resources[0].metadata, { sessionId: 's1' });
});
