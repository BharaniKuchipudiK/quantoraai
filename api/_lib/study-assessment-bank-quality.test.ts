import assert from 'node:assert/strict';
import test from 'node:test';
import { allStudyAssessmentItems } from './study-assessment-items.js';
import {
  STUDY_H2_PILOT_COVERAGE_POLICY,
  validateStudyAssessmentCorpusQuality,
  validateStudyAssessmentItemQuality,
} from './study-assessment-quality.js';

test('every Study bank item satisfies the H2.2 item-quality gate', () => {
  const items = allStudyAssessmentItems();
  assert.equal(items.length, 10, 'H2.2 guards the current baseline; it does not claim broad exam coverage');
  for (const item of items) {
    const quality = validateStudyAssessmentItemQuality(item);
    assert.deepEqual(quality.reasonCodes, [], `${item.key} fails H2.2 item quality`);
    assert.equal(quality.valid, true);
  }
});

test('the complete Study bank satisfies the explicit H2 pilot coverage floor', () => {
  const audit = validateStudyAssessmentCorpusQuality(allStudyAssessmentItems(), STUDY_H2_PILOT_COVERAGE_POLICY);
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
