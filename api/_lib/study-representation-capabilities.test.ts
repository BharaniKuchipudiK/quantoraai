import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudyRepresentationCapability,
  resolveStudyRepresentationCapabilityForConcept,
} from './study-representation-capabilities.js';

test('selects only existing subject-native renderer families with explicit delivery contracts', () => {
  const mechanics = resolveStudyRepresentationCapability('Newton second law and friction');
  assert.equal(mechanics?.rendererKind, 'physics-motion');
  assert.equal(mechanics?.deliveryClass, 'static_diagram');
  assert.match(mechanics?.renderCaption || '', /free-body/i);

  const electricity = resolveStudyRepresentationCapability('EMF, terminal potential difference, battery and circuit');
  assert.equal(electricity?.rendererKind, 'electricity-circuit');
  assert.equal(electricity?.deliveryClass, 'static_diagram');
  assert.match(electricity?.renderCaption || '', /EMF and terminal/i);

  assert.equal(resolveStudyRepresentationCapability('Solve the algebra equation x + 3 = 5')?.rendererKind, 'algebra-balance');
  assert.equal(resolveStudyRepresentationCapability('Label the cell membrane and nucleus')?.rendererKind, 'biology-cell');
  assert.equal(resolveStudyRepresentationCapability('Show a covalent bond between two atoms')?.rendererKind, 'chemistry-bond');
});

test('selects graph, process, timeline, and number-line capabilities only when their renderer has concrete input', () => {
  assert.equal(resolveStudyRepresentationCapability('velocity-time graph and slope')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('plot this on a coordinate plane by quadrant')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('show sine and cosine on the unit circle graph')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('process: input -> change -> result')?.rendererKind, 'process-flow');
  assert.equal(resolveStudyRepresentationCapability('timeline of events in 1914 and 1918')?.rendererKind, 'timeline');
  assert.equal(resolveStudyRepresentationCapability('number line from -3 to 5, mark 2')?.rendererKind, 'number-line');

  assert.equal(resolveStudyRepresentationCapability('show me a process visually'), null);
  assert.equal(resolveStudyRepresentationCapability('draw a timeline'), null);
  assert.equal(resolveStudyRepresentationCapability('show a number line'), null);
});

test('vector components use the native vector renderer rather than the generic slope graph', () => {
  const vector = resolveStudyRepresentationCapability('resolve vector components on x and y axes');
  assert.equal(vector?.rendererKind, 'physics-motion');
  assert.match(vector?.renderCaption || '', /vector components/i);
});

test('selects field-lines renderer for electric or magnetic field concepts', () => {
  assert.equal(resolveStudyRepresentationCapability('show electric field lines around a positive charge')?.rendererKind, 'field-lines');
  assert.equal(resolveStudyRepresentationCapability('explain magnetic field direction with right-hand rule')?.rendererKind, 'field-lines');
});

test('selects geometry-construction for Pythagoras even when the unknown is named x', () => {
  assert.equal(resolveStudyRepresentationCapability('Find side x in this right triangle using Pythagoras')?.rendererKind, 'geometry-construction');
  assert.equal(resolveStudyRepresentationCapability('hypotenuse of a right triangle')?.rendererKind, 'geometry-construction');
  assert.equal(resolveStudyRepresentationCapability('show generic geometry visually'), null);
});

test('keeps electricity separate from chemistry even when charge carriers are mentioned', () => {
  assert.equal(resolveStudyRepresentationCapability('electrons moving through a battery circuit with current')?.rendererKind, 'electricity-circuit');
  assert.equal(resolveStudyRepresentationCapability('electric current flows through a wire')?.rendererKind, 'electricity-circuit');
  assert.equal(resolveStudyRepresentationCapability('electrons shared in a covalent bond between atoms')?.rendererKind, 'chemistry-bond');
});

test('does not claim cell or bond pictures for broader biology and chemistry topics they cannot depict', () => {
  assert.equal(resolveStudyRepresentationCapability('Explain photosynthesis visually'), null);
  assert.equal(resolveStudyRepresentationCapability('Draw an acid base reaction'), null);
});

test('bare current is ordinary language, not enough evidence for an Electricity renderer', () => {
  assert.equal(resolveStudyRepresentationCapability('There is no current renderer family for this concept'), null);
  assert.equal(resolveStudyRepresentationCapability('Use the current explanation and continue'), null);
});

test('does not turn arbitrary content into a decorative visual', () => {
  assert.equal(resolveStudyRepresentationCapability('Explain opportunity cost in simple terms'), null);
});

test('Newton third-law lab promotion requires a direct learner visual or animation request', () => {
  const visual = resolveStudyRepresentationCapability("Show me Newton's third law visually");
  assert.equal(visual?.rendererKind, 'newton-lab');
  assert.equal(visual?.deliveryClass, 'timed_animation');
  assert.equal(visual?.renderCaption, null);
  assert.equal(
    resolveStudyRepresentationCapability("Animate Newton's third law of motion")?.rendererKind,
    'newton-lab',
  );

  const ordinaryLessonPrompt = [
    "Teach ONE idea about Newton's third law in this message — not a whole chapter.",
    'For mechanics or physics, include a subject-specific picture caption that names the actual motion and forces.',
    'Use one true visual only if it makes the idea easier to enter.',
  ].join(' ');
  assert.equal(resolveStudyRepresentationCapability(ordinaryLessonPrompt)?.rendererKind, 'physics-motion');
});

test('canonical Newton third-law identity survives control-only visual requests without transcript wording', () => {
  assert.equal(
    resolveStudyRepresentationCapabilityForConcept({
      conceptKey: 'physics.forces.newtons-third-law',
      conceptLabel: null,
      fallbackText: 'Show it visually',
    })?.rendererKind,
    'newton-lab',
  );

  assert.equal(
    resolveStudyRepresentationCapabilityForConcept({
      conceptKey: 'physics.forces.newtons-third-law',
      conceptLabel: null,
      fallbackText: 'Explain it again',
    })?.rendererKind,
    'physics-motion',
  );
});
