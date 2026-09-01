import assert from 'node:assert/strict';
import test from 'node:test';
import { studyAssessmentItemsForConcept } from './study-assessment-items.js';
import {
  STUDY_H2_PILOT_COVERAGE_POLICY,
  validateStudyAssessmentCorpusQuality,
  validateStudyAssessmentItemQuality,
} from './study-assessment-quality.js';

const PILOT_CONCEPTS = [
  'math.trigonometry.functions',
  'math.trigonometry.identities',
  'math.vector.scalar-vector',
  'math.vector.resultant',
  'math.vector.components',
  'physics.kinematics.speed-velocity-acceleration',
  'physics.kinematics.motion-graphs',
  'physics.kinematics.motion-in-plane',
  'physics.kinematics.projectile-motion',
];

test('every released Study item satisfies the H2.2 item-quality gate', () => {
  const items = PILOT_CONCEPTS.flatMap(studyAssessmentItemsForConcept);
  assert.equal(items.length, 10, 'H2.2 guards the current baseline; it does not claim broad exam coverage');
  for (const item of items) {
    const quality = validateStudyAssessmentItemQuality(item);
    assert.deepEqual(quality.reasonCodes, [], `${item.key} fails H2.2 item quality`);
    assert.equal(quality.valid, true);
  }
});

test('the released Study bank satisfies the explicit H2 pilot coverage floor', () => {
  const items = PILOT_CONCEPTS.flatMap(studyAssessmentItemsForConcept);
  const audit = validateStudyAssessmentCorpusQuality(items, STUDY_H2_PILOT_COVERAGE_POLICY);
  assert.deepEqual(audit.reasonCodes, []);
  assert.equal(audit.valid, true);
  assert.equal(audit.releasedItemCount, 10);
  assert.deepEqual(audit.conceptCoverage, {
    'math.trigonometry.functions': 1,
    'math.trigonometry.identities': 1,
    'math.vector.scalar-vector': 1,
    'math.vector.resultant': 1,
    'math.vector.components': 1,
    'physics.kinematics.speed-velocity-acceleration': 1,
    'physics.kinematics.motion-graphs': 2,
    'physics.kinematics.motion-in-plane': 1,
    'physics.kinematics.projectile-motion': 1,
  });
});
