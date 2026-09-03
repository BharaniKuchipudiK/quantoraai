import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudyRepresentationCapability } from './study-representation-capabilities.js';

test('selects only existing subject-native renderer families', () => {
  assert.equal(resolveStudyRepresentationCapability('Newton second law and friction')?.rendererKind, 'physics-motion');
  assert.equal(resolveStudyRepresentationCapability('EMF, terminal potential difference, battery and circuit')?.rendererKind, 'electricity-circuit');
  assert.equal(resolveStudyRepresentationCapability('Solve the algebra equation x + 3 = 5')?.rendererKind, 'algebra-balance');
  assert.equal(resolveStudyRepresentationCapability('Label the cell membrane and nucleus')?.rendererKind, 'biology-cell');
  assert.equal(resolveStudyRepresentationCapability('Show a covalent bond between two atoms')?.rendererKind, 'chemistry-bond');
});

test('selects graph, process, timeline, and number-line capabilities from semantics', () => {
  assert.equal(resolveStudyRepresentationCapability('velocity-time graph and slope')?.rendererKind, 'graph');
  assert.equal(resolveStudyRepresentationCapability('process: input -> change -> result')?.rendererKind, 'process-flow');
  assert.equal(resolveStudyRepresentationCapability('timeline of events in 1914 and 1918')?.rendererKind, 'timeline');
  assert.equal(resolveStudyRepresentationCapability('number line from -3 to 5, mark 2')?.rendererKind, 'number-line');
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
