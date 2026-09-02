import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_TEACHING_REPRESENTATION_VERSION,
  planStudyTeachingRepresentation,
} from './study-teaching-representation.js';

test('explicit visual request selects an existing subject-native visual when one is supported', () => {
  const plan = planStudyTeachingRepresentation({
    message: 'Teach me using images',
    contextText: 'Newtonian motion and friction',
  });
  assert.equal(plan.version, STUDY_TEACHING_REPRESENTATION_VERSION);
  assert.equal(plan.requestedMode, 'visual');
  assert.equal(plan.primaryRepresentation, 'annotated_diagram');
  assert.equal(plan.rendererRequired, true);
  assert.equal(plan.fallback, 'none');
  assert.equal(plan.reason, 'explicit_request');
});

test('explicit visual request fails honestly when the current renderer family is unavailable', () => {
  const plan = planStudyTeachingRepresentation({
    message: 'Teach me using images',
    contextText: 'EMF versus terminal potential difference in a battery circuit',
  });
  assert.equal(plan.requestedMode, 'visual');
  assert.equal(plan.primaryRepresentation, 'concise_text');
  assert.equal(plan.rendererRequired, false);
  assert.equal(plan.fallback, 'renderer_unavailable');
  assert.equal(plan.reason, 'explicit_request');
});

test('graph request selects graph only when graph semantics are established', () => {
  const supported = planStudyTeachingRepresentation({
    message: 'Show me with a graph',
    contextText: 'velocity-time graph and slope',
  });
  assert.equal(supported.primaryRepresentation, 'graph');
  assert.equal(supported.rendererRequired, true);

  const unsupported = planStudyTeachingRepresentation({
    message: 'Show me with a graph',
    contextText: 'define covalent bonding',
  });
  assert.equal(unsupported.primaryRepresentation, 'concise_text');
  assert.equal(unsupported.fallback, 'renderer_unavailable');
});

test('explicit worked-example, story and comparison requests change representation rather than only wording', () => {
  assert.equal(planStudyTeachingRepresentation({ message: 'Give me a worked example' }).primaryRepresentation, 'worked_example');
  assert.equal(planStudyTeachingRepresentation({ message: 'Explain this as a story' }).primaryRepresentation, 'story_analogy');
  assert.equal(planStudyTeachingRepresentation({ message: 'Compare velocity versus acceleration' }).primaryRepresentation, 'comparison');
});

test('make it easy requests concise teaching', () => {
  const plan = planStudyTeachingRepresentation({ message: 'Make it easy for me' });
  assert.equal(plan.requestedMode, 'concise');
  assert.equal(plan.primaryRepresentation, 'concise_text');
  assert.equal(plan.reason, 'explicit_request');
});

test('learner struggle changes representation instead of lengthening prose by default', () => {
  const visualRepair = planStudyTeachingRepresentation({
    message: "I still don't understand",
    contextText: 'algebra equation x + 3 = 5',
  });
  assert.equal(visualRepair.reason, 'struggle_repair');
  assert.equal(visualRepair.primaryRepresentation, 'annotated_diagram');
  assert.equal(visualRepair.rendererRequired, true);

  const nonVisualRepair = planStudyTeachingRepresentation({
    message: "I'm confused",
    contextText: 'a concept with no current renderer family',
  });
  assert.equal(nonVisualRepair.reason, 'struggle_repair');
  assert.equal(nonVisualRepair.primaryRepresentation, 'worked_example');
  assert.equal(nonVisualRepair.rendererRequired, false);
});

test('ordinary Study turn has a stable conservative default and does not invent a renderer', () => {
  const plan = planStudyTeachingRepresentation({
    message: 'What is potential difference?',
    contextText: 'electricity',
  });
  assert.equal(plan.requestedMode, null);
  assert.equal(plan.primaryRepresentation, 'concise_text');
  assert.equal(plan.rendererRequired, false);
  assert.equal(plan.fallback, 'none');
  assert.equal(plan.reason, 'default_teaching');
});
