import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enforceStudyStaticVisualText,
  resolveStudyStaticVisualContract,
} from './study-static-visual-delivery.js';

function route(representation = {}) {
  return {
    representation: {
      rendererRequired: true,
      fallback: 'none',
      rendererKind: 'electricity-circuit',
      deliveryClass: 'static_diagram',
      renderCaption: 'EMF and terminal potential difference: battery internal resistance and external load',
      ...representation,
    },
  };
}

test('server-selected static contract validates against the existing native renderer', () => {
  assert.deepEqual(resolveStudyStaticVisualContract(route()), {
    version: 'study-static-visual-delivery-2026-09-10.1',
    rendererKind: 'electricity-circuit',
    deliveryClass: 'static_diagram',
    caption: 'EMF and terminal potential difference: battery internal resistance and external load',
  });
});

test('required static visual cannot be omitted, duplicated, or replaced by model-authored visual tags', () => {
  const source = [
    'I cannot show a diagram in this text chat. The terminal voltage is lower under load.',
    '<quantora-study-picture caption="Right triangle using Pythagoras" />',
    '<quantora-study-picture caption="EMF and terminal voltage" />',
    '<quantora-study-lab kind="newton-third-law" />',
  ].join('\n');
  const prepared = enforceStudyStaticVisualText(source, route());
  assert.doesNotMatch(prepared, /cannot show a diagram/i);
  assert.doesNotMatch(prepared, /quantora-study-picture|quantora-study-lab/);
  assert.match(prepared, /terminal voltage is lower under load/i);
});

test('micro visual contracts carry concrete values and use the micro renderer', () => {
  const fraction = route({
    rendererKind: 'fraction-model',
    deliveryClass: 'micro_visual',
    renderCaption: 'Proportion model: 2/3 = 4/6',
  });
  assert.equal(resolveStudyStaticVisualContract(fraction)?.rendererKind, 'fraction-model');
});

test('renderer/caption disagreement fails closed and leaves written content untouched', () => {
  const bad = route({
    rendererKind: 'biology-cell',
    renderCaption: 'Right triangle: legs a and b, hypotenuse c, Pythagoras',
  });
  const source = 'Keep the written lesson. <quantora-study-picture caption="Cell membrane and nucleus" />';
  assert.equal(resolveStudyStaticVisualContract(bad), null);
  assert.equal(enforceStudyStaticVisualText(source, bad), source);
});

test('native lab routes remain owned by the existing lab delivery path', () => {
  const lab = route({
    rendererKind: 'circuit-lab',
    deliveryClass: 'timed_animation',
    renderCaption: null,
    primaryRepresentation: 'simulation_or_lab',
  });
  const source = '<quantora-study-lab kind="simple-dc-circuit" />';
  assert.equal(resolveStudyStaticVisualContract(lab), null);
  assert.equal(enforceStudyStaticVisualText(source, lab), source);
});

test('quoted and fenced platform-limit text is preserved', () => {
  const source = [
    '> I cannot show a diagram in this text chat.',
    '```text',
    'I cannot show a diagram in this text chat.',
    '```',
    'The cell still has a terminal voltage.',
  ].join('\n');
  const prepared = enforceStudyStaticVisualText(source, route());
  assert.match(prepared, /> I cannot show a diagram/);
  assert.match(prepared, /```text\nI cannot show a diagram/);
});
