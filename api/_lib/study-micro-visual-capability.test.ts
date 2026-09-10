import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudyRepresentationCapability,
  resolveStudyRepresentationCapabilityForConcept,
} from './study-representation-capabilities.js';
import { reportStudyRepresentationCoverage } from './study-representation-coverage.js';

test('fraction concepts route to the governed micro visual only with concrete renderer-safe values', () => {
  const direct = resolveStudyRepresentationCapability('Show equivalent fractions 2/3 and 4/6 visually');
  assert.equal(direct?.rendererKind, 'fraction-model');
  assert.equal(direct?.representation, 'annotated_diagram');
  assert.equal(direct?.reason, 'fraction');
  assert.equal(direct?.deliveryClass, 'micro_visual');
  assert.equal(direct?.renderCaption, 'Proportion model: 2/3 = 4/6');

  const canonical = resolveStudyRepresentationCapabilityForConcept({
    conceptKey: 'math.fractions.equivalent-fractions',
    conceptLabel: null,
    fallbackText: 'Show equivalent fractions 2/3 and 4/6 visually',
  });
  assert.equal(canonical?.rendererKind, 'fraction-model');

  assert.equal(resolveStudyRepresentationCapability('Show fractions visually'), null);
});

test('explicit state-change concepts route to the before-after renderer only when both states are known', () => {
  const direct = resolveStudyRepresentationCapability('Show the state change: changes from ice to liquid water');
  assert.equal(direct?.rendererKind, 'before-after');
  assert.equal(direct?.representation, 'annotated_diagram');
  assert.equal(direct?.reason, 'state_change');
  assert.equal(direct?.deliveryClass, 'micro_visual');
  assert.equal(direct?.renderCaption, 'Before/after: ice -> liquid water');

  const canonical = resolveStudyRepresentationCapabilityForConcept({
    conceptKey: 'science.states.phase-change',
    conceptLabel: null,
    fallbackText: 'Before/after: ice -> liquid water',
  });
  assert.equal(canonical?.rendererKind, 'before-after');

  assert.equal(resolveStudyRepresentationCapabilityForConcept({
    conceptKey: 'science.states.phase-change',
    conceptLabel: null,
    fallbackText: 'Show it visually',
  }), null);
});

test('micro routing stays narrow rather than claiming generic ratio or change coverage', () => {
  assert.equal(resolveStudyRepresentationCapability('Explain the ratio of boys to girls'), null);
  assert.equal(resolveStudyRepresentationCapability('Explain why practice can change performance'), null);
  assert.equal(resolveStudyRepresentationCapability('Explain opportunity cost in simple terms'), null);
});

test('operator coverage names both micro renderers and their delivery class', () => {
  const report = reportStudyRepresentationCoverage();
  const fraction = report.rows.find((item) => item.requestClass === 'visual_fraction');
  const beforeAfter = report.rows.find((item) => item.requestClass === 'visual_before_after');
  assert.deepEqual(fraction, {
    requestClass: 'visual_fraction',
    rendererKind: 'fraction-model',
    deliveryClass: 'micro_visual',
    outcome: 'renderer_available',
  });
  assert.deepEqual(beforeAfter, {
    requestClass: 'visual_before_after',
    rendererKind: 'before-after',
    deliveryClass: 'micro_visual',
    outcome: 'renderer_available',
  });
});
