import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudyAdaptiveRequestContext } from './study-adaptive-request.js';
import {
  observeStudyWorkingInteraction,
  setStudyWorkingConcept,
} from './study-working-state.js';
import {
  STUDY_LEARNING_INTERACTION,
  STUDY_LEARNING_INTERACTION_VERSION,
} from './study-learning-interactions.js';

const NOW = new Date().toISOString();

function observation(type, extra = {}) {
  return {
    contractVersion: STUDY_LEARNING_INTERACTION_VERSION,
    observationOnly: true,
    type,
    source: 'test',
    occurredAt: NOW,
    ...extra,
  };
}

test('Study sends bounded concept context for server-side learner adaptation', () => {
  setStudyWorkingConcept({ conceptKey: 'test.no-observations', conceptLabel: 'No observations' });
  assert.deepEqual(buildStudyAdaptiveRequestContext({
    studioDomain: 'education',
    brief: { conceptId: 'Session.Motion-Graphs', label: '  Motion   graphs  ' },
  }), {
    studyContext: { conceptKey: 'session.motion-graphs', conceptLabel: 'Motion graphs' },
  });
});

test('Study includes the current temporary working state on the next turn', () => {
  setStudyWorkingConcept({ conceptKey: 'math.linear-functions', conceptLabel: 'Linear functions' });
  observeStudyWorkingInteraction(observation(STUDY_LEARNING_INTERACTION.HINT_REQUESTED));
  const result = buildStudyAdaptiveRequestContext({
    studioDomain: 'education',
    brief: { conceptId: 'math.linear-functions', label: 'Linear functions' },
  });
  assert.equal(result.studyContext.workingState.temporary, true);
  assert.equal(result.studyContext.workingState.hintDependence, 'emerging');
  assert.equal(result.studyContext.workingState.scaffoldingNeed, 'moderate');
});

test('other workspaces are an exact adaptive-learning no-op', () => {
  setStudyWorkingConcept({ conceptKey: 'test.non-study', conceptLabel: 'Non Study' });
  observeStudyWorkingInteraction(observation(STUDY_LEARNING_INTERACTION.HINT_REQUESTED));
  for (const studioDomain of [null, 'finance', 'research', 'travel', 'coding', 'general']) {
    assert.deepEqual(buildStudyAdaptiveRequestContext({
      studioDomain,
      brief: { conceptId: 'session.motion', label: 'Motion' },
    }), {});
  }
});