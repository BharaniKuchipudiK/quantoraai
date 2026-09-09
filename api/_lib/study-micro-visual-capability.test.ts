import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudyRepresentationCapability,
  resolveStudyRepresentationCapabilityForConcept,
} from './study-representation-capabilities.js';
import { reportStudyRepresentationCoverage } from './study-representation-coverage.js';

test('fraction concepts route to the governed micro visual renderer', () => {
  const direct = resolveStudyRepresentationCapability('Show equivalent fractions 2/3 and 4/6 visually');
  assert.equal(direct?.rendererKind, 'fraction-model');
  assert.equal(direct?.representation, 'annotated_diagram');
  assert.equal(direct?.reason, 'fraction');

  const canonical = resolveStudyRepresentationCapabilityForConcept({
    conceptKey: 'math.fractions.equivalent-fractions',
    conceptLabel: null,
    fallbackText: 'Show it visually',
  });
  assert.equal(canonical?.rendererKind, 'fraction-model');
});

test('explicit state-change concepts route to the before-after renderer', () => {
  const direct = resolveStudyRepresentationCapability('Show the before/after state change from ice to liquid water');
  assert.equal(direct?.rendererKind, 'before-after');
  assert.equal(direct?.representation, 'annotated_diagram');
  assert.equal(direct?.reason, 'state_change');

  const canonical = resolveStudyRepresentationCapabilityForConcept({
    conceptKey: 'science.states.phase-change',
    conceptLabel: null,
    fallbackText: 'Show it visually',
  });
  assert.equal(canonical?.rendererKind, 'before-after');
});

test('micro routing stays narrow rather than claiming generic ratio or change coverage', () => {
  assert.equal(resolveStudyRepresentationCapability('Explain the ratio of boys to girls'), null);
  assert.equal(resolveStudyRepresentationCapability('Explain why practice can change performance'), null);
  assert.equal(resolveStudyRepresentationCapability('Explain opportunity cost in simple terms'), null);
});

test('operator coverage names both micro renderers as available', () => {
  const report = reportStudyRepresentationCoverage();
  const fraction = report.rows.find((item) => item.requestClass === 'visual_fraction');
  const beforeAfter = report.rows.find((item) => item.requestClass === 'visual_before_after');
  assert.deepEqual(fraction, {
    requestClass: 'visual_fraction',
    rendererKind: 'fraction-model',
    outcome: 'renderer_available',
  });
  assert.deepEqual(beforeAfter, {
    requestClass: 'visual_before_after',
    rendererKind: 'before-after',
    outcome: 'renderer_available',
  });
});
