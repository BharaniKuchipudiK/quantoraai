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

test('fraction routing stays narrow rather than claiming generic ratio coverage', () => {
  assert.equal(resolveStudyRepresentationCapability('Explain the ratio of boys to girls'), null);
  assert.equal(resolveStudyRepresentationCapability('Explain opportunity cost in simple terms'), null);
});

test('operator coverage names the fraction renderer as available', () => {
  const row = reportStudyRepresentationCoverage().rows.find((item) => item.requestClass === 'visual_fraction');
  assert.deepEqual(row, {
    requestClass: 'visual_fraction',
    rendererKind: 'fraction-model',
    outcome: 'renderer_available',
  });
});
