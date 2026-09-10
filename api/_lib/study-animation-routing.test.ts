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

test('standalone interactive demonstration request also routes to the native Newton lab', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: "Explain Newton's third law with an interactive demonstration",
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
});

test('normal Show visually routes Newton third law to the native lab without broadening mechanics', () => {
  const thirdLaw = interpretStudyTurn({
    studioDomain: 'education',
    message: "Show me Newton's third law visually",
    history: [],
    hasImages: false,
  });

  assert.ok(thirdLaw);
  assert.equal(thirdLaw.representation.requestedMode, 'visual');
  assert.equal(thirdLaw.representation.primaryRepresentation, 'simulation_or_lab');
  assert.equal(thirdLaw.representation.rendererRequired, true);
  assert.equal(thirdLaw.representation.rendererKind, 'newton-lab');
  assert.match(formatStudyCognitiveDirective(thirdLaw), /<quantora-study-lab kind="newton-third-law" \/>/);

  const inertia = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show inertia visually',
    history: [],
    hasImages: false,
  });

  assert.ok(inertia);
  assert.equal(inertia.representation.requestedMode, 'visual');
  assert.equal(inertia.representation.primaryRepresentation, 'annotated_diagram');
  assert.equal(inertia.representation.rendererRequired, true);
  assert.equal(inertia.representation.rendererKind, 'physics-motion');
  assert.doesNotMatch(formatStudyCognitiveDirective(inertia), /quantora-study-lab/);

  const circuit = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show an electric circuit visually',
    history: [],
    hasImages: false,
  });

  assert.ok(circuit);
  assert.equal(circuit.representation.requestedMode, 'visual');
  assert.equal(circuit.representation.rendererKind, 'electricity-circuit');
  assert.doesNotMatch(formatStudyCognitiveDirective(circuit), /quantora-study-lab/);
});

test('control-only Show it visually preserves the established Newton third-law concept', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show it visually',
    history: [{ role: 'user', content: "Explain Newton's third law of motion" }],
    hasImages: false,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.representation.requestedMode, 'visual');
  assert.equal(interpretation.representation.rendererKind, 'newton-lab');
  assert.match(formatStudyCognitiveDirective(interpretation), /<quantora-study-lab kind="newton-third-law" \/>/);
});

test('[was-red] casual animation follow-up preserves the established Newton concept', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'can you show me with an animation to visualise',
    history: [{ role: 'user', content: "Explain Newton's third law of motion" }],
    hasImages: false,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.continuity, 'follow_up');
  assert.equal(interpretation.activeLearningContext.concept.label, "Explain Newton's third law of motion");
  assert.equal(interpretation.representation.requestedMode, 'animation');
  assert.equal(interpretation.representation.primaryRepresentation, 'simulation_or_lab');
  assert.equal(interpretation.representation.rendererRequired, true);
  assert.equal(interpretation.representation.rendererKind, 'newton-lab');
  assert.match(formatStudyCognitiveDirective(interpretation), /<quantora-study-lab kind="newton-third-law" \/>/);
});
