import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import type { StudyActiveLearningContext } from './study-active-learning-context.js';
import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';
import {
  directStudyLearningExperience,
  STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION,
} from './study-learning-experience-director.js';

function learnerModel(move: StudyNextLearningMove, overrides: Partial<StudyLearnerModel> = {}): StudyLearnerModel {
  return {
    version: 'test',
    concept: { id: 'linear-functions', key: 'math.linear-functions' },
    understanding: { state: 'emerging', evidenceCount: 2, evidenceKinds: ['assessment_item'], observedThrough: '2026-09-09T00:00:00.000Z' },
    misconception: { state: 'none_observed', signalCount: 0, latestSignalAt: null, code: null, confidence: null, reasonCodes: [], remediation: null, lastResolvedCode: null },
    retention: { state: 'untested', evidenceCount: 0, targetDelayDays: 1, dueAt: null, due: false },
    transfer: { state: 'untested', evidenceCount: 0, latestObservedAt: null },
    nextLearningMove: { type: move, reasonCode: `test:${move}`, instruction: 'Use the governed next move.', learnerFacingText: 'Try the next move.' },
    ...overrides,
  };
}

function working(overrides: Partial<StudyWorkingStateSnapshot> = {}): StudyWorkingStateSnapshot {
  return {
    version: 'study-working-state-v1',
    temporary: true,
    conceptKey: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    misconceptionCandidate: 'none',
    hintDependence: 'none',
    representationPreference: null,
    recentPattern: 'neutral',
    scaffoldingNeed: 'low',
    observedSignals: 2,
    reasonCodes: [],
    ...overrides,
  };
}

function active(representation: StudyActiveLearningContext['representationCapability'] = null): StudyActiveLearningContext {
  return {
    version: 'study-active-learning-context-2026-09-07.1',
    mode: 'concept_teaching',
    concept: { id: 'linear-functions', key: 'math.linear-functions', label: 'Linear functions', source: 'verified_learner_model', confidence: 'canonical' },
    learnerState: { understanding: 'emerging', misconception: 'none_observed', retention: 'untested', transfer: 'untested', nextLearningMove: 'guided_repair' },
    explicitRepresentationRequest: false,
    representationCapability: representation,
    allowAutomaticSubjectVisual: Boolean(representation),
  };
}

const linearLab = {
  version: 'study-representation-capability-2026-09-10.1',
  representation: 'simulation_or_lab',
  rendererKind: 'linear-function-lab',
  reason: 'linear_function_lab',
  deliveryClass: 'interactive_lab',
  renderCaption: null,
} as StudyActiveLearningContext['representationCapability'];

test('verified learner truth remains the highest pedagogy authority', () => {
  const plan = directStudyLearningExperience({
    intent: 'explain',
    baseDifficulty: 'standard',
    learnerModel: learnerModel('transfer_task'),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high', representationPreference: 'interactive' }),
    activeLearningContext: active(linearLab),
  });
  assert.equal(plan.version, STUDY_LEARNING_EXPERIENCE_DIRECTOR_VERSION);
  assert.equal(plan.teachingStrategy, 'transfer_application');
  assert.equal(plan.modality, 'governed_assessment');
  assert.equal(plan.interactionType, 'explain');
  assert.equal(plan.verificationRequirement, 'fresh_independent');
  assert.ok(plan.reasonCodes.includes('verified_move:transfer_task'));
});

test('one reviewed misconception signal remains a candidate and requests a discriminating probe', () => {
  const plan = directStudyLearningExperience({
    intent: 'continue',
    baseDifficulty: 'standard',
    learnerModel: learnerModel('diagnose_misconception', {
      misconception: {
        state: 'signal_observed', signalCount: 1, latestSignalAt: '2026-09-09T00:00:00.000Z',
        code: 'representation_misread', confidence: 1, reasonCodes: ['reviewed_distractor_mapping'], remediation: null, lastResolvedCode: null,
      },
    }),
  });
  assert.equal(plan.teachingStrategy, 'compare_and_contrast');
  assert.equal(plan.modality, 'governed_assessment');
  assert.equal(plan.hintPolicy, 'none');
  assert.equal(plan.verificationRequirement, 'fresh_independent');
  assert.ok(plan.reasonCodes.includes('candidate_requires_discriminating_probe'));
});

test('repeated targeted evidence confirms a misconception before targeted repair begins', () => {
  const plan = directStudyLearningExperience({
    intent: 'continue',
    baseDifficulty: 'standard',
    learnerModel: learnerModel('diagnose_misconception', {
      misconception: {
        state: 'signal_observed', signalCount: 2, latestSignalAt: '2026-09-09T00:00:00.000Z',
        code: 'representation_misread', confidence: 1, reasonCodes: ['reviewed_distractor_mapping'], remediation: null, lastResolvedCode: null,
      },
    }),
  });
  assert.equal(plan.teachingStrategy, 'misconception_repair');
  assert.equal(plan.modality, 'comparison');
  assert.equal(plan.verificationRequirement, 'governed_after_teaching');
  assert.ok(plan.reasonCodes.includes('confirmed_by_repeated_targeted_evidence'));
});

test('temporary struggle can increase scaffolding but never becomes a misconception diagnosis', () => {
  const plan = directStudyLearningExperience({
    intent: 'explain',
    baseDifficulty: 'advanced',
    workingState: working({
      misconceptionCandidate: 'possible',
      recentPattern: 'struggle',
      scaffoldingNeed: 'high',
      hintDependence: 'high',
      reasonCodes: ['repeated_incorrect_response', 'repeated_hint_use'],
    }),
    activeLearningContext: active(),
  });
  assert.equal(plan.teachingStrategy, 'scaffold_then_fade');
  assert.equal(plan.modality, 'worked_example');
  assert.equal(plan.difficulty, 'foundational');
  assert.equal(plan.hintPolicy, 'fade');
  assert.equal(plan.verificationRequirement, 'governed_after_teaching');
  assert.deepEqual(plan.reasonCodes, ['temporary_scaffolding_needed']);
  assert.equal(plan.reasonCodes.includes('repeated_incorrect_response'), false);
  assert.equal(plan.reasonCodes.includes('repeated_hint_use'), false);
  assert.notEqual(plan.teachingStrategy, 'misconception_repair');
});

test('temporary interactive preference is honored only when the governed capability supports it', () => {
  const supported = directStudyLearningExperience({
    intent: 'explain',
    baseDifficulty: 'standard',
    workingState: working({ representationPreference: 'interactive' }),
    activeLearningContext: active(linearLab),
  });
  const unsupported = directStudyLearningExperience({
    intent: 'explain',
    baseDifficulty: 'standard',
    workingState: working({ representationPreference: 'interactive' }),
    activeLearningContext: active(null),
  });
  assert.equal(supported.modality, 'interactive');
  assert.equal(supported.interactionType, 'predict');
  assert.equal(unsupported.modality, 'text');
  assert.equal(unsupported.reasonCodes[0], 'default_teaching');
});

test('high hint dependence produces a fade policy rather than automatically giving more help', () => {
  const plan = directStudyLearningExperience({
    intent: 'explain',
    baseDifficulty: 'standard',
    workingState: working({ hintDependence: 'high', representationPreference: 'interactive' }),
    activeLearningContext: active(linearLab),
  });
  assert.equal(plan.modality, 'interactive');
  assert.equal(plan.hintPolicy, 'fade');
});

test('verified guided repair can use temporary representation preference without changing learner truth', () => {
  const plan = directStudyLearningExperience({
    intent: 'explain',
    baseDifficulty: 'standard',
    learnerModel: learnerModel('guided_repair'),
    workingState: working({ representationPreference: 'interactive', scaffoldingNeed: 'moderate' }),
    activeLearningContext: active(linearLab),
  });
  assert.equal(plan.teachingStrategy, 'scaffold_then_fade');
  assert.equal(plan.modality, 'interactive');
  assert.equal(plan.interactionType, 'predict');
  assert.equal(plan.verificationRequirement, 'governed_after_teaching');
});

test('retention due state controls verification timing without inventing retention evidence', () => {
  const notDue = directStudyLearningExperience({
    intent: 'continue',
    baseDifficulty: 'standard',
    learnerModel: learnerModel('retention_probe'),
  });
  const due = directStudyLearningExperience({
    intent: 'continue',
    baseDifficulty: 'standard',
    learnerModel: learnerModel('retention_probe', {
      retention: { state: 'needs_support', evidenceCount: 1, targetDelayDays: 1, dueAt: '2026-09-09T00:00:00.000Z', due: true },
    }),
  });
  assert.equal(notDue.verificationRequirement, 'defer_until_due');
  assert.equal(due.verificationRequirement, 'fresh_independent');
  assert.equal(due.hintPolicy, 'none');
});

test('explicit representation requests stay request-driven rather than being silently overridden', () => {
  const context = active(linearLab);
  context.explicitRepresentationRequest = true;
  const plan = directStudyLearningExperience({
    intent: 'explain',
    baseDifficulty: 'standard',
    learnerModel: learnerModel('guided_repair'),
    workingState: working({ representationPreference: 'interactive' }),
    activeLearningContext: context,
  });
  assert.equal(plan.modality, 'request_driven');
  assert.deepEqual(plan.reasonCodes, ['explicit_representation_request']);
});
