import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudyRepresentationCapability } from './study-representation-capabilities.js';

test('selects only existing subject-native renderer families', () => {
  assert.equal(resolveStudyRepresentationCapability('Newton second law and friction')?.rendererKind, 'physics-motion');
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

test('does not invent an electricity renderer before one exists', () => {
  assert.equal(resolveStudyRepresentationCapability('EMF, terminal potential difference, battery and circuit'), null);
});

test('does not turn arbitrary content into a decorative visual', () => {
  assert.equal(resolveStudyRepresentationCapability('Explain opportunity cost in simple terms'), null);
});
