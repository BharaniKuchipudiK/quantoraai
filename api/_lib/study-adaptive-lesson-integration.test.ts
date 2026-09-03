import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStudyCognitiveDirective, interpretStudyTurn } from './study-cognitive-routing.js';

test('repeated learner difficulty changes a supported concept into visual guided reconstruction', () => {
  const history = [
    { role: 'user', text: 'Explain Newton second law and friction.' },
    { role: 'assistant', text: 'Force changes motion when forces are unbalanced.' },
    { role: 'user', text: "I don't understand." },
    { role: 'assistant', text: 'Let me simplify it with one short explanation.' },
    { role: 'user', text: 'Make it easier for me.' },
    { role: 'assistant', text: 'Think about pushing a box.' },
    { role: 'user', text: 'Tell me with a story instead.' },
    { role: 'assistant', text: 'Imagine pushing a cart.' },
    { role: 'user', text: 'Still difficult to understand.' },
  ];

  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Can you show me visually?',
    history,
  });

  assert.ok(interpretation);
  assert.equal(interpretation.intervention.state, 'blocked');
  assert.equal(interpretation.intervention.action, 'guided_reconstruction');
  assert.equal(interpretation.representation.primaryRepresentation, 'annotated_diagram');
  assert.equal(interpretation.representation.rendererRequired, true);
  assert.equal(interpretation.representation.rendererKind, 'physics-motion');
  assert.deepEqual(interpretation.lessonLoop.beats, ['SEE', 'PREDICT']);
  assert.equal(interpretation.lessonLoop.mustWaitForLearner, true);
  assert.equal(interpretation.lessonLoop.maxLearnerQuestions, 1);

  const directive = formatStudyCognitiveDirective(interpretation);
  assert.match(directive, /Current teaching-path state: blocked; intervention: guided_reconstruction/i);
  assert.match(directive, /Teaching beats for THIS response only: SEE -> PREDICT/i);
  assert.match(directive, /Wait boundary: YES/i);
  assert.match(directive, /do not merely paraphrase the previous explanation/i);
});

test('assistant wording never becomes learner struggle evidence', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'What happens next?',
    history: [
      { role: 'user', text: 'Explain Newton second law.' },
      { role: 'assistant', text: 'Let me simplify this and explain it another way.' },
    ],
  });

  assert.ok(interpretation);
  assert.equal(interpretation.intervention.struggleSignals, 0);
  assert.equal(interpretation.intervention.state, 'stable');
  assert.equal(interpretation.intervention.action, 'continue');
});

test('unsupported Electricity visual remains honest even when the learner is blocked', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Can you show me visually?',
    history: [
      { role: 'user', text: 'Explain EMF and terminal potential difference in a battery circuit.' },
      { role: 'assistant', text: 'EMF is energy supplied per coulomb.' },
      { role: 'user', text: "I don't understand." },
      { role: 'assistant', text: 'Here is a simpler explanation.' },
      { role: 'user', text: 'Make it easier.' },
      { role: 'assistant', text: 'Think of energy being supplied and then lost internally.' },
      { role: 'user', text: 'Tell me with a story.' },
      { role: 'assistant', text: 'Imagine an energy budget.' },
      { role: 'user', text: 'Still difficult to understand.' },
    ],
  });

  assert.ok(interpretation);
  assert.equal(interpretation.intervention.state, 'blocked');
  assert.equal(interpretation.representation.primaryRepresentation, 'concise_text');
  assert.equal(interpretation.representation.rendererRequired, false);
  assert.equal(interpretation.representation.rendererKind, null);
  assert.equal(interpretation.representation.fallback, 'renderer_unavailable');
  assert.deepEqual(interpretation.lessonLoop.beats, ['PREDICT']);
  assert.equal(interpretation.lessonLoop.mustWaitForLearner, true);
  assert.match(formatStudyCognitiveDirective(interpretation), /do not claim that an unsupported visual/i);
});

test('an old mechanics topic cannot leak a physics visual into the current Electricity lesson', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Can you show me visually?',
    history: [
      { role: 'user', text: 'Explain Newton second law and friction.' },
      { role: 'assistant', text: 'A net force changes velocity.' },
      { role: 'user', text: 'Now switch topics. Explain EMF and terminal potential difference in a battery circuit.' },
      { role: 'assistant', text: 'EMF is energy supplied per coulomb by the source.' },
      { role: 'user', text: "I don't understand." },
      { role: 'assistant', text: 'I will make the energy accounting shorter.' },
      { role: 'user', text: 'Make it easier for me.' },
    ],
  });

  assert.ok(interpretation);
  assert.equal(interpretation.representation.primaryRepresentation, 'concise_text');
  assert.equal(interpretation.representation.rendererRequired, false);
  assert.equal(interpretation.representation.rendererKind, null);
  assert.equal(interpretation.representation.fallback, 'renderer_unavailable');
});

test('generic continuation stays inside the authoritative Study teaching-turn policy', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Continue',
    history: [
      { role: 'user', text: 'Explain Newton second law and friction.' },
      { role: 'assistant', text: 'A net force changes velocity.' },
    ],
  });

  assert.ok(interpretation);
  assert.equal(interpretation.lessonLoop.reason, 'continuation_policy');
  assert.deepEqual(interpretation.lessonLoop.beats, []);
  assert.equal(interpretation.lessonLoop.mustWaitForLearner, false);
  const directive = formatStudyCognitiveDirective(interpretation);
  assert.match(directive, /choose the next useful SEE, EXPLAIN, TRY, or VERIFY beat/i);
  assert.match(directive, /Wait boundary: no forced wait/i);
});

test('a visual preference by itself does not label the learner as struggling', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show me a diagram.',
    history: [{ role: 'user', text: 'We are studying Newtonian motion and friction.' }],
  });

  assert.ok(interpretation);
  assert.equal(interpretation.intervention.state, 'stable');
  assert.equal(interpretation.intervention.action, 'continue');
  assert.equal(interpretation.representation.primaryRepresentation, 'annotated_diagram');
  assert.equal(interpretation.representation.rendererKind, 'physics-motion');
  assert.deepEqual(interpretation.lessonLoop.beats, ['SEE', 'EXPLAIN']);
  assert.equal(interpretation.lessonLoop.mustWaitForLearner, false);
});
