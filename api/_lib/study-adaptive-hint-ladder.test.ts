import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import type { StudyLearningExperiencePlan } from './study-learning-experience-director.js';
import { planStudyAdaptiveHint } from './study-adaptive-hint-ladder.js';

function experience(overrides: Partial<StudyLearningExperiencePlan> = {}): StudyLearningExperiencePlan {
  return {
    version: 'study-learning-experience-director-2026-09-09.2',
    teachingStrategy: 'scaffold_then_fade',
    modality: 'text',
    explanationDensity: 'compressed',
    interactionType: 'calculate',
    difficulty: 'foundational',
    hintPolicy: 'progressive',
    verificationRequirement: 'governed_after_teaching',
    reasonCodes: ['test'],
    ...overrides,
  };
}

function working(hintDepth: number): StudyWorkingStateSnapshot {
  return {
    version: 'study-working-state-v1',
    temporary: true,
    conceptKey: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    misconceptionCandidate: 'none',
    hintDependence: hintDepth >= 3 ? 'high' : hintDepth ? 'emerging' : 'none',
    hintDepth,
    representationPreference: null,
    recentPattern: 'neutral',
    scaffoldingNeed: hintDepth ? 'moderate' : 'low',
    observedSignals: hintDepth * 2,
    reasonCodes: [],
  };
}

test('hint ladder progresses one deterministic rung at a time through all six levels', () => {
  const kinds = [
    'attention_cue',
    'directional_hint',
    'structural_hint',
    'visual_partial_scaffold',
    'worked_step',
    'answer',
  ];
  for (let prior = 0; prior < 6; prior += 1) {
    const plan = planStudyAdaptiveHint({
      message: prior ? 'Give me another hint' : 'Give me a hint',
      workingState: working(prior),
      experiencePlan: experience(),
    });
    assert.equal(plan.level, prior + 1);
    assert.equal(plan.kind, kinds[prior]);
    assert.equal(plan.allowed, true);
    assert.equal(plan.mayRevealAnswer, prior === 5);
  }
});

test('independent verification blocks hints and answers completely', () => {
  const plan = planStudyAdaptiveHint({
    message: 'Give me a hint',
    workingState: working(5),
    experiencePlan: experience({ verificationRequirement: 'fresh_independent' }),
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.level, 0);
  assert.equal(plan.mayRevealAnswer, false);
  assert.equal(plan.reasonCode, 'independent_verification_protected');
});

test('director none policy blocks the ladder', () => {
  const plan = planStudyAdaptiveHint({
    message: 'Give me a clue',
    workingState: working(2),
    experiencePlan: experience({ hintPolicy: 'none', verificationRequirement: 'none' }),
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reasonCode, 'director_hints_disabled');
});

test('fade posture never escalates a hint-dependent learner to a deeper rung', () => {
  const plan = planStudyAdaptiveHint({
    message: 'Another hint please',
    workingState: working(4),
    experiencePlan: experience({ hintPolicy: 'fade', verificationRequirement: 'governed_after_teaching' }),
  });
  assert.equal(plan.level, 4);
  assert.equal(plan.kind, 'visual_partial_scaffold');
  assert.equal(plan.reasonCode, 'hint_fade_hold');
  assert.equal(plan.mayRevealAnswer, false);
});

test('level four marks a governed visual only when capability exists', () => {
  const plan = planStudyAdaptiveHint({
    message: 'Give me another hint',
    workingState: working(3),
    experiencePlan: experience(),
    activeLearningContext: {
      representationCapability: {
        version: 'test',
        conceptFamily: 'linear_function',
        representation: 'graph',
        rendererKind: 'graph',
        reason: 'linear_function_graph',
      },
    } as never,
  });
  assert.equal(plan.level, 4);
  assert.equal(plan.useGovernedVisual, true);
});

test('ordinary non-hint turns are exact inactive ladder plans', () => {
  const plan = planStudyAdaptiveHint({
    message: 'Explain linear functions',
    workingState: working(3),
    experiencePlan: experience(),
  });
  assert.equal(plan.requested, false);
  assert.equal(plan.level, 0);
  assert.equal(plan.kind, 'none');
  assert.equal(plan.instruction, '');
});
