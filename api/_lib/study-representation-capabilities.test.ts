import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudyRepresentationCapability,
  resolveStudyRepresentationCapabilityForConcept,
} from './study-representation-capabilities.js';

test('selects only existing subject-native renderer families', () => {
  assert.equal(resolveStudyRepresentationCapability('Newton second law and friction')?.rendererKind, 'physics-motion');
  assert.equal(resolveStudyRepresentationCapability('EMF, terminal potential difference, battery and circuit')?.rendererKind, 'electricity-circuit');
  assert.equal(resolveStudyRepresentationCapability('Solve the algebra equation x + 3 = 5')?.rendererKind, 'algebra-balance');
  assert.equal(resolveStudyRepresentationCapability('Label the cell membrane and nucleus')?.rendererKind, 'biology-cell');
  assert.equal(resolveStudyRepresentationCapability('Show a covalent bond between two atoms')?.rendererKind, 'chemistry-bond');
});

test('selects graph, process, timeline, and number-line capabilities from semantics', () => {
  assert.equal(resolveStudyRepresentationCapability('velocity-time graph and slope')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('plot this on a coordinate plane by quadrant')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('show sine and cosine on the unit circle graph')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('resolve vector components on x and y axes')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('process: input -> change -> result')?.rendererKind, 'process-flow');
  assert.equal(resolveStudyRepresentationCapability('timeline of events in 1914 and 1918')?.rendererKind, 'timeline');
  assert.equal(resolveStudyRepresentationCapability('number line from -3 to 5, mark 2')?.rendererKind, 'number-line');
});

test('selects field-lines renderer for electric or magnetic field concepts', () => {
  assert.equal(resolveStudyRepresentationCapability('show electric field lines around a positive charge')?.rendererKind, 'field-lines');
  assert.equal(resolveStudyRepresentationCapability('explain magnetic field direction with right-hand rule')?.rendererKind, 'field-lines');
});

test('selects geometry-construction for Pythagoras even when the unknown is named x', () => {
  assert.equal(resolveStudyRepresentationCapability('Find side x in this right triangle using Pythagoras')?.rendererKind, 'geometry-construction');
  assert.equal(resolveStudyRepresentationCapability('hypotenuse of a right triangle')?.rendererKind, 'geometry-construction');
});

test('keeps electricity separate from chemistry even when charge carriers are mentioned', () => {
  assert.equal(resolveStudyRepresentationCapability('electrons moving through a battery circuit with current')?.rendererKind, 'electricity-circuit');
  assert.equal(resolveStudyRepresentationCapability('electric current flows through a wire')?.rendererKind, 'electricity-circuit');
  assert.equal(resolveStudyRepresentationCapability('electrons shared in a covalent bond between atoms')?.rendererKind, 'chemistry-bond');
});

test('bare current is ordinary language, not enough evidence for an Electricity renderer', () => {
  assert.equal(resolveStudyRepresentationCapability('There is no current renderer family for this concept'), null);
  assert.equal(resolveStudyRepresentationCapability('Use the current explanation and continue'), null);
});

test('does not turn arbitrary content into a decorative visual', () => {
  assert.equal(resolveStudyRepresentationCapability('Explain opportunity cost in simple terms'), null);
});

test('Newton third-law lab promotion requires a direct learner visual or animation request', () => {
  assert.equal(
    resolveStudyRepresentationCapability("Show me Newton's third law visually")?.rendererKind,
    'newton-lab',
  );
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
