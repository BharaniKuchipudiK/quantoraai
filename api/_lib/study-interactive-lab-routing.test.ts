import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStudyCognitiveDirective, interpretStudyTurn } from './study-cognitive-routing.js';
import { reportStudyRepresentationCoverage } from './study-representation-coverage.js';

test('explicit linear-function interactive request routes to the native math lab', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Teach me the linear function y = mx + b with an interactive lab',
    history: [],
    hasImages: false,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.activeLearningContext.mode, 'concept_teaching');
  assert.equal(interpretation.representation.requestedMode, 'animation');
  assert.equal(interpretation.representation.primaryRepresentation, 'simulation_or_lab');
  assert.equal(interpretation.representation.rendererRequired, true);
  assert.equal(interpretation.representation.rendererKind, 'linear-function-lab');
  assert.equal(interpretation.representation.learnerAction, 'predict');
  assert.match(formatStudyCognitiveDirective(interpretation), /<quantora-study-lab kind="linear-function" \/>/);
});

test('control-only interactive follow-up preserves the established linear-function concept', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show it as an interactive lab',
    history: [{ role: 'user', content: 'Explain linear functions and slope-intercept form y = mx + b' }],
    hasImages: false,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.representation.requestedMode, 'animation');
  assert.equal(interpretation.representation.rendererKind, 'linear-function-lab');
  assert.match(formatStudyCognitiveDirective(interpretation), /<quantora-study-lab kind="linear-function" \/>/);
});

test('ordinary visual request for a linear function stays on the graph renderer', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show the linear function y = mx + b visually',
    history: [],
    hasImages: false,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.representation.requestedMode, 'visual');
  assert.equal(interpretation.representation.primaryRepresentation, 'graph');
  assert.equal(interpretation.representation.rendererKind, 'graph');
  assert.doesNotMatch(formatStudyCognitiveDirective(interpretation), /kind="linear-function"/);
});

test('unsupported interactive mathematics does not borrow the linear-function lab', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show me an interactive simulation for factoring a quadratic equation',
    history: [],
    hasImages: false,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.representation.requestedMode, 'animation');
  assert.equal(interpretation.representation.rendererRequired, false);
  assert.equal(interpretation.representation.rendererKind, null);
  assert.equal(interpretation.representation.fallback, 'renderer_unavailable');
  assert.doesNotMatch(formatStudyCognitiveDirective(interpretation), /quantora-study-lab/);
});

test('operator representation coverage includes the linear-function lab', () => {
  const row = reportStudyRepresentationCoverage().rows.find((item) => item.requestClass === 'visual_linear_function_lab');
  assert.deepEqual(row, {
    requestClass: 'visual_linear_function_lab',
    rendererKind: 'linear-function-lab',
    outcome: 'renderer_available',
  });
});
