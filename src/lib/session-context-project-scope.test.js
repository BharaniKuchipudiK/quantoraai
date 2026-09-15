import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSessionContext, normalizeSessionContext } from './session-context.js';

test('session context preserves project scope metadata across merges', () => {
  const normalized = normalizeSessionContext({
    projectId: 'project-personal',
    goal: 'Explain photosynthesis',
    facts: ['Current-chat fact'],
  });
  assert.equal(normalized.projectId, 'project-personal');

  const merged = mergeSessionContext(normalized, { understanding: 'Current chat only' });
  assert.equal(merged.projectId, 'project-personal');
  assert.equal(merged.goal, 'Explain photosynthesis');
  assert.equal(merged.understanding, 'Current chat only');
});

test('invalid project scope metadata is discarded', () => {
  const normalized = normalizeSessionContext({
    projectId: 'project personal with spaces',
    goal: 'Keep the valid context',
  });
  assert.equal(normalized.projectId, undefined);
  assert.equal(normalized.goal, 'Keep the valid context');
});
