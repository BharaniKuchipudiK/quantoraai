import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyLearnerModel } from './study-learner-model.js';
import { planStudyMisconceptionRepair } from './study-misconception-repair-engine.js';

function model(signalCount: number, state: StudyLearnerModel['misconception']['state'] = 'signal_observed'): StudyLearnerModel {
  return {
    version: 'test',
    concept: { id: 'c1', key: 'physics.kinematics.motion-graphs' },
    understanding: { state: 'emerging', evidenceCount: Math.max(1, signalCount), evidenceKinds: ['assessment_item'], observedThrough: '2026-09-09T00:00:00.000Z' },
    misconception: {
      state,
      signalCount,
      latestSignalAt: '2026-09-09T00:00:00.000Z',
      code: state === 'none_observed' ? null : 'representation_misread',
      confidence: state === 'none_observed' ? null : 1,
      reasonCodes: state === 'none_observed' ? [] : ['reviewed_distractor_mapping'],
      remediation: null,
      lastResolvedCode: null,
    },
    retention: { state: 'untested', evidenceCount: 0 },
    transfer: { state: 'untested', evidenceCount: 0, latestObservedAt: null },
    nextLearningMove: { type: 'diagnose_misconception', reasonCode: 'test', instruction: 'test', learnerFacingText: 'test' },
  };
}

test('one reviewed signal remains a candidate', () => {
  const plan = planStudyMisconceptionRepair(model(1));
  assert.equal(plan.stage, 'candidate');
  assert.equal(plan.reasonCode, 'candidate_requires_discriminating_probe');
});

test('repeated targeted evidence is required for confirmed stage', () => {
  const plan = planStudyMisconceptionRepair(model(2));
  assert.equal(plan.stage, 'confirmed');
  assert.equal(plan.reasonCode, 'confirmed_by_repeated_targeted_evidence');
});

test('cleared learner truth has no active repair stage', () => {
  const plan = planStudyMisconceptionRepair(model(0, 'none_observed'));
  assert.equal(plan.stage, 'none');
  assert.equal(plan.code, null);
});
