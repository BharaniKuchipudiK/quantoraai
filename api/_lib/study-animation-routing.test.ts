import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStudyCognitiveDirective, interpretStudyTurn } from './study-cognitive-routing.js';

test('explicit Newton third-law animation routes to the native Study lab', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: "Can you explain Newton's third law of motion with an animation?",
    history: [],
    hasImages: false,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.activeLearningContext.mode, 'concept_teaching');
  assert.equal(interpretation.representation.requestedMode, 'animation');
  assert.equal(interpretation.representation.primaryRepresentation, 'simulation_or_lab');
  assert.equal(interpretation.representation.rendererRequired, true);
  assert.equal(interpretation.representation.rendererKind, 'newton-lab');

  const directive = formatStudyCognitiveDirective(interpretation);
  assert.match(directive, /<quantora-study-lab kind="newton-third-law" \/>/);
  assert.match(directive, /do not replace it with prose frames/i);
});
