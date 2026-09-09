import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import {
  applyStudyAdaptiveDifficulty,
  controlStudyAdaptiveDifficulty,
  STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION,
} from './study-adaptive-difficulty-controller.js';
import type { StudyLearningExperiencePlan } from './study-learning-experience-director.js';
import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';

function learner(move: StudyNextLearningMove, overrides: Partial<StudyLearnerModel> = {}): StudyLearnerModel {
  return {
    version: 'test',
    concept: { id: 'c1', key: 'math.linear-functions' },
    understanding: { state: 'emerging', evidenceCount: 2, evidenceKinds: ['assessment_item'], observedThrough: '2026-09-09T00:00:00.000Z' },
    misconception: { state: 'none_observed', signalCount: 0, latestSignalAt: null, code: null, confidence: null, reasonCodes: [], remediation: null, lastResolvedCode: null },
    retention: { state: 'untested', evidenceCount: 0, targetDelayDays: 1, dueAt: null, due: false },
    transfer: { state: 'untested', evidenceCount: 0, latestObservedAt: null },
    nextLearningMove: { type: move, reasonCode: `test:${move}`, instruction: 'Do the governed next move.', learnerFacingText: 'Try the next move.' },
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

function experience(overrides: Partial<StudyLearningExperiencePlan> = {}): StudyLearningExperiencePlan {
  return {
    version: 'study-learning-experience-director-2026-09-09.2',
    teachingStrategy: 'socratic_application',
    modality: 'worked_example',
    explanationDensity: 'standard',
    interactionType: 'calculate',
    difficulty: 'standard',
    hintPolicy: 'withhold_until_attempt',
    verificationRequirement: 'none',
    reasonCodes: ['test'],
    ...overrides,
  };
}

test('no verified evidence maintains difficulty rather than guessing upward', () => {
  const plan = controlStudyAdaptiveDifficulty({});
  assert.equal(plan.version, STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION);
  assert.equal(plan.difficultyAction, 'maintain');
  assert.equal(plan.scaffoldingAction, 'maintain');
  assert.equal(plan.practiceMode, 'routine');
});

test('temporary struggle can only reduce difficulty and add support', () => {
  const plan = controlStudyAdaptiveDifficulty({
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high', representationPreference: 'visual' }),
  });
  assert.equal(plan.difficultyAction, 'reduce');
  assert.equal(plan.scaffoldingAction, 'add');
  assert.equal(plan.representationAction, 'change');
  assert.equal(plan.practiceMode, 'recognition');
  assert.ok(plan.reasonCodes.includes('temporary_struggle_pattern'));
});

test('misconception candidate locks independent discriminating probe', () => {
  const plan = controlStudyAdaptiveDifficulty({
    learnerModel: learner('diagnose_misconception', {
      misconception: {
        state: 'signal_observed', signalCount: 1, latestSignalAt: '2026-09-09T00:00:00.000Z',
        code: 'representation_misread', confidence: 1, reasonCodes: ['reviewed_distractor_mapping'], remediation: null, lastResolvedCode: null,
      },
    }),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high' }),
  });
  assert.equal(plan.difficultyAction, 'maintain');
  assert.equal(plan.scaffoldingAction, 'remove');
  assert.equal(plan.practiceMode, 'recognition');
  assert.deepEqual(plan.reasonCodes, ['misconception_candidate_probe_locked']);
});

test('confirmed misconception reduces challenge and adds scaffolding before re-verification', () => {
  const plan = controlStudyAdaptiveDifficulty({
    learnerModel: learner('diagnose_misconception', {
      misconception: {
        state: 'signal_observed', signalCount: 2, latestSignalAt: '2026-09-09T00:00:00.000Z',
        code: 'representation_misread', confidence: 1, reasonCodes: ['reviewed_distractor_mapping'], remediation: null, lastResolvedCode: null,
      },
    }),
  });
  assert.equal(plan.difficultyAction, 'reduce');
  assert.equal(plan.scaffoldingAction, 'add');
  assert.equal(plan.practiceMode, 'recognition');
});

test('vary-evidence moves recognition toward retrieval before application', () => {
  const retrieval = controlStudyAdaptiveDifficulty({ learnerModel: learner('vary_evidence') });
  const application = controlStudyAdaptiveDifficulty({
    learnerModel: learner('vary_evidence', {
      understanding: { state: 'emerging', evidenceCount: 3, evidenceKinds: ['assessment_item', 'retrieval'], observedThrough: '2026-09-09T00:00:00.000Z' },
    }),
  });
  assert.equal(retrieval.practiceMode, 'retrieval');
  assert.equal(application.practiceMode, 'application');
  assert.equal(retrieval.scaffoldingAction, 'remove');
  assert.equal(application.scaffoldingAction, 'remove');
});

test('verified transfer readiness is the evidence-backed upward challenge path', () => {
  const plan = controlStudyAdaptiveDifficulty({ learnerModel: learner('transfer_task') });
  assert.equal(plan.difficultyAction, 'increase');
  assert.equal(plan.scaffoldingAction, 'remove');
  assert.equal(plan.practiceMode, 'application');
  assert.deepEqual(plan.reasonCodes, ['verified_transfer_ready']);
});

test('failed transfer reduces challenge and permits support instead of escalating', () => {
  const plan = controlStudyAdaptiveDifficulty({
    learnerModel: learner('transfer_task', {
      transfer: { state: 'needs_support', evidenceCount: 1, latestObservedAt: '2026-09-09T00:00:00.000Z' },
    }),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high', representationPreference: 'visual' }),
  });
  assert.equal(plan.difficultyAction, 'reduce');
  assert.equal(plan.scaffoldingAction, 'add');
  assert.equal(plan.representationAction, 'change');
  assert.equal(plan.practiceMode, 'application');
  assert.ok(plan.reasonCodes.includes('verified_transfer_needs_support'));
  assert.ok(plan.reasonCodes.includes('temporary_struggle_pattern'));
});

test('independent verification cannot be weakened by temporary struggle', () => {
  const plan = controlStudyAdaptiveDifficulty({
    learnerModel: learner('retention_probe'),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high', representationPreference: 'visual' }),
  });
  assert.equal(plan.difficultyAction, 'maintain');
  assert.equal(plan.scaffoldingAction, 'remove');
  assert.equal(plan.representationAction, 'maintain');
  assert.equal(plan.practiceMode, 'retrieval');
  assert.deepEqual(plan.reasonCodes, ['verified_retention_probe']);
});

test('difficulty application shifts one bounded level and never overrides explicit foundational request upward', () => {
  const increased = applyStudyAdaptiveDifficulty({
    experiencePlan: experience(),
    difficultyPlan: {
      version: STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION,
      difficultyAction: 'increase', scaffoldingAction: 'remove', representationAction: 'maintain', practiceMode: 'application', reasonCodes: ['verified_transfer_ready'],
    },
  });
  const foundational = applyStudyAdaptiveDifficulty({
    experiencePlan: experience({ difficulty: 'foundational' }),
    difficultyPlan: {
      version: STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION,
      difficultyAction: 'increase', scaffoldingAction: 'remove', representationAction: 'maintain', practiceMode: 'application', reasonCodes: ['verified_transfer_ready'],
    },
  });
  assert.equal(increased.difficulty, 'advanced');
  assert.equal(increased.interactionType, 'explain');
  assert.equal(foundational.difficulty, 'foundational');
});

test('fresh independent verification removes hints and cannot receive added scaffolding', () => {
  const applied = applyStudyAdaptiveDifficulty({
    experiencePlan: experience({ verificationRequirement: 'fresh_independent', hintPolicy: 'progressive' }),
    difficultyPlan: {
      version: STUDY_ADAPTIVE_DIFFICULTY_CONTROLLER_VERSION,
      difficultyAction: 'maintain', scaffoldingAction: 'remove', representationAction: 'maintain', practiceMode: 'retrieval', reasonCodes: ['verified_independent_retrieval'],
    },
  });
  assert.equal(applied.hintPolicy, 'none');
  assert.equal(applied.interactionType, 'retrieve');
  assert.equal(applied.modality, 'governed_assessment');
});
