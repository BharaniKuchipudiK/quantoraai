import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudyActiveLearningContext } from './study-active-learning-context.js';
import type { StudyLearnerModel } from './study-learner-model.js';

function learnerModel(key: string): StudyLearnerModel {
  return {
    version: 'test',
    concept: { id: 'concept-1', key },
    understanding: { state: 'emerging', evidenceCount: 1, evidenceKinds: ['assessment'], observedThrough: null },
    misconception: { state: 'none_observed', signalCount: 0, latestSignalAt: null, code: null, confidence: null, reasonCodes: [], remediation: null, lastResolvedCode: null },
    retention: { state: 'untested', evidenceCount: 0 },
    transfer: { state: 'untested', evidenceCount: 0, latestObservedAt: null },
    nextLearningMove: { type: 'guided_repair', reasonCode: 'test', instruction: 'repair', learnerFacingText: 'repair' },
  };
}

test('study plan is meta-learning and cannot inherit an old mechanics visual', () => {
  const context = buildStudyActiveLearningContext({
    intent: 'plan',
    message: 'Can you prepare a study plan for a week with one hour a day?',
    contextText: 'Newton force friction and motion',
  });
  assert.equal(context.mode, 'meta_planning');
  assert.equal(context.representationCapability, null);
  assert.equal(context.allowAutomaticSubjectVisual, false);
});

test('conversation gap review is not silently turned into a subject diagram', () => {
  const context = buildStudyActiveLearningContext({
    intent: 'explain',
    message: 'Based on our conversation, what are the gaps in my study?',
    contextText: 'force and mathematical modelling',
  });
  assert.equal(context.mode, 'progress_review');
  assert.equal(context.representationCapability, null);
  assert.equal(context.allowAutomaticSubjectVisual, false);
});

test('verified learner concept is the canonical semantic source', () => {
  const context = buildStudyActiveLearningContext({
    intent: 'explain',
    message: 'explain this again',
    contextText: 'show the current idea',
    learnerModel: learnerModel('physics.mechanics.newton-laws'),
  });
  assert.equal(context.concept.source, 'verified_learner_model');
  assert.equal(context.concept.key, 'physics.mechanics.newton-laws');
  assert.equal(context.representationCapability?.rendererKind, 'physics-motion');
});

test('Newton third-law animation request resolves to the native lab', () => {
  const context = buildStudyActiveLearningContext({
    intent: 'explain',
    message: "Explain Newton's third law of motion with an animation",
    contextText: "Newton's third law of motion",
  });
  assert.equal(context.representationCapability?.representation, 'simulation_or_lab');
  assert.equal(context.representationCapability?.rendererKind, 'newton-lab');
});
