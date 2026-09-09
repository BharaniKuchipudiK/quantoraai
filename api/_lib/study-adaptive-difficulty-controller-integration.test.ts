import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import { formatStudyCognitiveDirective, interpretStudyTurn, publicStudyCognitiveMetadata } from './study-cognitive-routing.js';
import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';

function learner(move: StudyNextLearningMove, overrides: Partial<StudyLearnerModel> = {}): StudyLearnerModel {
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

test('temporary struggle reduces an advanced request by one bounded level and adds support', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Give a rigorous derivation of linear functions.',
    learnerModel: learner('guided_repair'),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high' }),
  });
  assert.equal(route?.difficultyControl.difficultyAction, 'reduce');
  assert.equal(route?.difficultyControl.scaffoldingAction, 'add');
  assert.equal(route?.difficulty, 'foundational');
  assert.equal(route?.experienceDirector.explanationDensity, 'compressed');
  assert.equal(route?.requiresVerification, true);
});

test('verified transfer readiness increases challenge and switches to application', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Continue',
    history: [{ role: 'user', text: 'Explain linear functions.' }],
    learnerModel: learner('transfer_task'),
  });
  assert.equal(route?.difficultyControl.difficultyAction, 'increase');
  assert.equal(route?.difficultyControl.practiceMode, 'application');
  assert.equal(route?.difficulty, 'advanced');
  assert.equal(route?.experienceDirector.interactionType, 'explain');
  assert.equal(route?.experienceDirector.hintPolicy, 'none');
  assert.equal(route?.requiresVerification, true);
});

test('failed transfer never escalates the production route', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Continue',
    history: [{ role: 'user', text: 'Explain linear functions.' }],
    learnerModel: learner('transfer_task', {
      transfer: { state: 'needs_support', evidenceCount: 1, latestObservedAt: '2026-09-09T00:00:00.000Z' },
    }),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high' }),
  });
  assert.equal(route?.difficultyControl.difficultyAction, 'reduce');
  assert.equal(route?.difficultyControl.practiceMode, 'application');
  assert.equal(route?.difficulty, 'foundational');
  assert.equal(route?.experienceDirector.hintPolicy, 'none');
  assert.equal(route?.requiresVerification, true);
});

test('failed transfer with visual support preserves the independent assessment boundary', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Explain linear functions.',
    learnerModel: learner('transfer_task', {
      transfer: { state: 'needs_support', evidenceCount: 1, latestObservedAt: '2026-09-09T00:00:00.000Z' },
    }),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high', representationPreference: 'visual' }),
  });
  assert.equal(route?.experienceDirector.verificationRequirement, 'fresh_independent');
  assert.equal(route?.difficulty, 'foundational');
  assert.equal(route?.representation.primaryRepresentation, 'governed_assessment');
  assert.equal(route?.representation.rendererRequired, false);
  assert.equal(route?.experienceDirector.hintPolicy, 'none');
  assert.equal(route?.difficultyControl.scaffoldingAction, 'remove');
  assert.equal(route?.difficultyControl.representationAction, 'maintain');
  assert.deepEqual(route?.lessonLoop.beats, ['TRY']);
});

test('retention probe remains independent even when temporary working state says struggle', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Continue',
    history: [{ role: 'user', text: 'Explain linear functions.' }],
    learnerModel: learner('retention_probe', {
      retention: { state: 'supported', evidenceCount: 1, targetDelayDays: 7, dueAt: '2026-09-09T00:00:00.000Z', due: true },
    }),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high', representationPreference: 'visual' }),
  });
  assert.equal(route?.difficultyControl.scaffoldingAction, 'remove');
  assert.equal(route?.difficultyControl.representationAction, 'maintain');
  assert.equal(route?.experienceDirector.hintPolicy, 'none');
  assert.equal(route?.representation.primaryRepresentation, 'governed_assessment');
  assert.equal(route?.requiresVerification, true);
});

test('candidate misconception cannot be softened by temporary struggle before discriminating probe', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Continue',
    history: [{ role: 'user', text: 'Explain linear functions.' }],
    learnerModel: learner('diagnose_misconception', {
      misconception: {
        state: 'signal_observed', signalCount: 1, latestSignalAt: '2026-09-09T00:00:00.000Z',
        code: 'representation_misread', confidence: 1, reasonCodes: ['reviewed_distractor_mapping'], remediation: null, lastResolvedCode: null,
      },
    }),
    workingState: working({ recentPattern: 'struggle', scaffoldingNeed: 'high' }),
  });
  assert.equal(route?.difficultyControl.difficultyAction, 'maintain');
  assert.equal(route?.difficultyControl.scaffoldingAction, 'remove');
  assert.equal(route?.experienceDirector.modality, 'governed_assessment');
  assert.equal(route?.experienceDirector.hintPolicy, 'none');
  assert.equal(route?.requiresVerification, true);
});

test('difficulty controller is inspectable in directive and bounded public metadata', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Continue',
    history: [{ role: 'user', text: 'Explain linear functions.' }],
    learnerModel: learner('transfer_task'),
  });
  const directive = formatStudyCognitiveDirective(route);
  const metadata = publicStudyCognitiveMetadata(route);
  assert.match(directive, /Adaptive difficulty: increase/);
  assert.match(directive, /practice mode: application/);
  assert.equal(metadata?.difficultyControl.difficultyAction, 'increase');
  assert.equal(metadata?.difficultyControl.practiceMode, 'application');
  assert.equal('workingState' in (metadata || {}), false);
  assert.equal('learnerModel' in (metadata || {}), false);
});
