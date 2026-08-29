import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudyAdaptiveRequestContext } from './study-adaptive-request.js';

test('Study sends bounded concept context for server-side learner adaptation', () => {
  assert.deepEqual(buildStudyAdaptiveRequestContext({
    studioDomain: 'education',
    brief: { conceptId: 'Session.Motion-Graphs', label: '  Motion   graphs  ' },
  }), {
    studyContext: { conceptKey: 'session.motion-graphs', conceptLabel: 'Motion graphs' },
  });
});

test('other workspaces are an exact adaptive-learning no-op', () => {
  for (const studioDomain of [null, 'finance', 'research', 'travel', 'coding', 'general']) {
    assert.deepEqual(buildStudyAdaptiveRequestContext({
      studioDomain,
      brief: { conceptId: 'session.motion', label: 'Motion' },
    }), {});
  }
});
