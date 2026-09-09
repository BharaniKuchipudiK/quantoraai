import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_WORKING_STATE_TTL_MS,
  deriveStudyWorkingState,
} from './study-working-state.js';
import {
  STUDY_LEARNING_INTERACTION,
  STUDY_LEARNING_INTERACTION_VERSION,
} from './study-learning-interactions.js';

const NOW = Date.UTC(2026, 8, 9, 3, 30, 0);

function observation(type, offsetMs = 0, extra = {}) {
  return {
    contractVersion: STUDY_LEARNING_INTERACTION_VERSION,
    observationOnly: true,
    type,
    source: 'test',
    occurredAt: new Date(NOW + offsetMs).toISOString(),
    ...extra,
  };
}

function derive(events) {
  return deriveStudyWorkingState({
    events,
    conceptKey: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    now: () => NOW,
  });
}

test('one incorrect answer is struggle evidence but not a misconception diagnosis', () => {
  const state = derive([observation(STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT)]);
  assert.equal(state.misconceptionCandidate, 'none');
  assert.equal(state.scaffoldingNeed, 'moderate');
  assert.equal(state.temporary, true);
});

test('two consecutive incorrect responses create only a possible misconception candidate', () => {
  const state = derive([
    observation(STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT, -2000),
    observation(STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT, -1000),
  ]);
  assert.equal(state.misconceptionCandidate, 'possible');
  assert.equal(state.recentPattern, 'struggle');
  assert.equal(state.scaffoldingNeed, 'high');
  assert.ok(state.reasonCodes.includes('repeated_incorrect_response'));
});

test('later verified success clears the consecutive incorrect misconception candidate', () => {
  const state = derive([
    observation(STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT, -3000),
    observation(STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT, -2000),
    observation(STUDY_LEARNING_INTERACTION.RESPONSE_CORRECT, -1000),
  ]);
  assert.equal(state.misconceptionCandidate, 'none');
  assert.equal(state.recentPattern, 'mixed');
});

test('repeated hints raise temporary hint dependence without claiming mastery or confidence', () => {
  const state = derive([
    observation(STUDY_LEARNING_INTERACTION.HINT_REQUESTED, -5000),
    observation(STUDY_LEARNING_INTERACTION.HINT_DEPTH_USED, -4900, { hintDepth: 1 }),
    observation(STUDY_LEARNING_INTERACTION.HINT_REQUESTED, -3000),
    observation(STUDY_LEARNING_INTERACTION.HINT_REQUESTED, -1000),
  ]);
  assert.equal(state.hintDependence, 'high');
  assert.equal(state.scaffoldingNeed, 'high');
  assert.equal('mastery' in state, false);
  assert.equal('confidence' in state, false);
});

test('latest representation interaction becomes only a current-concept preference candidate', () => {
  const state = derive([
    observation(STUDY_LEARNING_INTERACTION.VISUAL_REQUESTED, -4000),
    observation(STUDY_LEARNING_INTERACTION.SIMULATION_MANIPULATED, -1000),
  ]);
  assert.equal(state.representationPreference, 'interactive');
  assert.ok(state.reasonCodes.includes('interactive_manipulation_observed'));
});

test('working observations decay after the bounded session window', () => {
  const state = deriveStudyWorkingState({
    events: [observation(STUDY_LEARNING_INTERACTION.HINT_REQUESTED, -(STUDY_WORKING_STATE_TTL_MS + 1))],
    conceptKey: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    now: () => NOW,
  });
  assert.equal(state, null);
});

test('working state is bounded to the latest observation window', () => {
  const events = Array.from({ length: 20 }, (_, index) => observation(
    index % 2 === 0 ? STUDY_LEARNING_INTERACTION.VISUAL_REQUESTED : STUDY_LEARNING_INTERACTION.HINT_REQUESTED,
    -20 + index,
  ));
  const state = derive(events);
  assert.equal(state.observedSignals, 12);
  assert.ok(state.reasonCodes.length <= 6);
});
