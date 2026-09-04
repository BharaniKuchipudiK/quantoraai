import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';
import {
  STUDY_TEACHING_REPRESENTATION_VERSION,
  planStudyTeachingRepresentation,
} from './study-teaching-representation.js';

function learnerHistory(contextText = '') {
  return contextText.split('\n').filter(Boolean).map((text) => ({ role: 'user', text }));
}

function verifiedLearnerModel(nextLearningMove: StudyNextLearningMove): StudyLearnerModel {
  return {
    version: 'study-learner-model-test-fixture',
    concept: { id: 'electricity-emf', key: 'physics.electricity.emf-terminal-voltage' },
    understanding: {
      state: 'emerging',
      evidenceCount: 1,
      evidenceKinds: ['assessment_item'],
      observedThrough: '2026-09-03T00:00:00.000Z',
    },
    misconception: {
      state: 'none_observed',
      signalCount: 0,
      latestSignalAt: null,
      code: null,
      confidence: null,
      reasonCodes: [],
      remediation: null,
      lastResolvedCode: null,
    },
    retention: {
      state: nextLearningMove === 'retention_probe' ? 'needs_support' : 'untested',
      evidenceCount: 0,
      targetDelayDays: 1,
      dueAt: null,
      due: nextLearningMove === 'retention_probe',
    },
    transfer: {
      state: nextLearningMove === 'transfer_task' ? 'untested' : 'untested',
      evidenceCount: 0,
      latestObservedAt: null,
    },
    nextLearningMove: {
      type: nextLearningMove,
      reasonCode: `test:${nextLearningMove}`,
      instruction: 'Use the verified next learning move.',
      learnerFacingText: 'Try the verified next learning move.',
    },
  };
}

test('explicit visual request selects an existing subject-native visual when one is supported', () => {
  const plan = planStudyTeachingRepresentation({
    message: 'Teach me using images',
    contextText: 'Newtonian motion and friction',
  });
  assert.equal(plan.version, STUDY_TEACHING_REPRESENTATION_VERSION);
  assert.equal(plan.requestedMode, 'visual');
  assert.equal(plan.primaryRepresentation, 'annotated_diagram');
  assert.equal(plan.rendererRequired, true);
  assert.equal(plan.rendererKind, 'physics-motion');
  assert.equal(plan.fallback, 'none');
  assert.equal(plan.reason, 'explicit_request');
});

test('explicit Electricity visual request selects the native circuit renderer', () => {
  const plan = planStudyTeachingRepresentation({
    message: 'Teach me using images',
    contextText: 'EMF versus terminal potential difference in a battery circuit',
  });
  assert.equal(plan.requestedMode, 'visual');
  assert.equal(plan.primaryRepresentation, 'annotated_diagram');
  assert.equal(plan.rendererRequired, true);
  assert.equal(plan.rendererKind, 'electricity-circuit');
  assert.equal(plan.fallback, 'none');
  assert.equal(plan.reason, 'explicit_request');
});

test('graph request selects graph only when graph semantics are established', () => {
  const supported = planStudyTeachingRepresentation({
    message: 'Show me with a graph',
    contextText: 'velocity-time graph and slope',
  });
  assert.equal(supported.primaryRepresentation, 'graph');
  assert.equal(supported.rendererRequired, true);
  assert.equal(supported.rendererKind, 'graph');

  const quadrant = planStudyTeachingRepresentation({
    message: 'Show me quadrant II sine signs with a graph',
  });
  assert.equal(quadrant.primaryRepresentation, 'graph');
  assert.equal(quadrant.rendererRequired, true);
  assert.equal(quadrant.rendererKind, 'graph');

  const unsupported = planStudyTeachingRepresentation({
    message: 'Show me with a graph',
    contextText: 'define covalent bonding',
  });
  assert.equal(unsupported.primaryRepresentation, 'concise_text');
  assert.equal(unsupported.fallback, 'renderer_unavailable');
});

test('explicit worked-example, story and comparison requests change representation rather than only wording', () => {
  assert.equal(planStudyTeachingRepresentation({ message: 'Give me a worked example' }).primaryRepresentation, 'worked_example');
  assert.equal(planStudyTeachingRepresentation({ message: 'Explain this as a story' }).primaryRepresentation, 'story_analogy');
  assert.equal(planStudyTeachingRepresentation({ message: 'Compare velocity versus acceleration' }).primaryRepresentation, 'comparison');
});

test('make it easy requests concise teaching', () => {
  const plan = planStudyTeachingRepresentation({ message: 'Make it easy for me' });
  assert.equal(plan.requestedMode, 'concise');
  assert.equal(plan.primaryRepresentation, 'concise_text');
  assert.equal(plan.reason, 'explicit_request');
});

test('first struggle compresses rather than forcing a visual everywhere', () => {
  const contextText = 'algebra equation x + 3 = 5';
  const plan = planStudyTeachingRepresentation({
    message: "I still don't understand",
    contextText,
    history: learnerHistory(contextText),
  });
  assert.equal(plan.reason, 'struggle_repair');
  assert.equal(plan.primaryRepresentation, 'concise_text');
  assert.equal(plan.rendererRequired, false);
});

test('repeated struggle changes representation and chooses a visual only when the concept supports one', () => {
  const visualContext = 'Newtonian motion and friction\nMake it easier for me';
  const visualRepair = planStudyTeachingRepresentation({
    message: "I still don't understand",
    contextText: visualContext,
    history: learnerHistory(visualContext),
  });
  assert.equal(visualRepair.reason, 'struggle_repair');
  assert.equal(visualRepair.primaryRepresentation, 'annotated_diagram');
  assert.equal(visualRepair.rendererRequired, true);
  assert.equal(visualRepair.rendererKind, 'physics-motion');

  const electricityContext = 'EMF and terminal voltage in a battery circuit\nMake it easier for me';
  const electricityRepair = planStudyTeachingRepresentation({
    message: "I still don't understand",
    contextText: electricityContext,
    history: learnerHistory(electricityContext),
  });
  assert.equal(electricityRepair.reason, 'struggle_repair');
  assert.equal(electricityRepair.primaryRepresentation, 'annotated_diagram');
  assert.equal(electricityRepair.rendererRequired, true);
  assert.equal(electricityRepair.rendererKind, 'electricity-circuit');

  const nonVisualContext = 'a concept with no current renderer family\nMake it easier for me';
  const nonVisualRepair = planStudyTeachingRepresentation({
    message: "I still don't understand",
    contextText: nonVisualContext,
    history: learnerHistory(nonVisualContext),
  });
  assert.equal(nonVisualRepair.reason, 'struggle_repair');
  assert.equal(nonVisualRepair.primaryRepresentation, 'worked_example');
  assert.equal(nonVisualRepair.rendererRequired, false);
});

test('repeated failed modality changes trigger guided reconstruction instead of another explanation', () => {
  const contextText = 'Explain it with a story\nI am confused\nShow me an example';
  const plan = planStudyTeachingRepresentation({
    message: "I still don't understand",
    contextText,
    history: learnerHistory(contextText),
  });
  assert.equal(plan.reason, 'struggle_repair');
  assert.equal(plan.primaryRepresentation, 'interactive_probe');
  assert.equal(plan.learnerAction, 'predict');
});

test('the same Electricity concept materially changes representation from verified learner state', () => {
  const contextText = 'EMF versus terminal voltage in a battery circuit with internal resistance';
  const cases: Array<{
    move: StudyNextLearningMove;
    representation: string;
    action: string;
    rendererKind?: string | null;
  }> = [
    { move: 'independent_retrieval', representation: 'interactive_probe', action: 'retrieve' },
    { move: 'diagnose_misconception', representation: 'comparison', action: 'compare' },
    { move: 'confirm_misconception', representation: 'comparison', action: 'compare' },
    { move: 'guided_repair', representation: 'annotated_diagram', action: 'predict', rendererKind: 'electricity-circuit' },
    { move: 'vary_evidence', representation: 'worked_example', action: 'calculate' },
    { move: 'retention_probe', representation: 'governed_assessment', action: 'retrieve' },
    { move: 'transfer_task', representation: 'governed_assessment', action: 'explain' },
  ];

  for (const expected of cases) {
    const plan = planStudyTeachingRepresentation({
      message: 'What should I do next with this concept?',
      contextText,
      learnerModel: verifiedLearnerModel(expected.move),
    });
    assert.equal(plan.reason, 'verified_learner_state', expected.move);
    assert.equal(plan.primaryRepresentation, expected.representation, expected.move);
    assert.equal(plan.learnerAction, expected.action, expected.move);
    assert.equal(plan.rendererKind, expected.rendererKind || null, expected.move);
  }
});

test('an explicit learner representation request outranks stored learner state', () => {
  const plan = planStudyTeachingRepresentation({
    message: 'Show me visually',
    contextText: 'EMF versus terminal voltage in a battery circuit',
    learnerModel: verifiedLearnerModel('transfer_task'),
  });
  assert.equal(plan.reason, 'explicit_request');
  assert.equal(plan.primaryRepresentation, 'annotated_diagram');
  assert.equal(plan.rendererKind, 'electricity-circuit');
});

test('a fresh learner struggle signal outranks older verified state without rewriting that state', () => {
  const plan = planStudyTeachingRepresentation({
    message: "I still don't understand",
    contextText: 'EMF versus terminal voltage in a battery circuit',
    learnerModel: verifiedLearnerModel('transfer_task'),
  });
  assert.equal(plan.reason, 'struggle_repair');
  assert.equal(plan.primaryRepresentation, 'concise_text');
});

test('ordinary Study turn has a stable conservative default and does not invent a renderer', () => {
  const plan = planStudyTeachingRepresentation({
    message: 'What is potential difference?',
    contextText: 'electricity',
  });
  assert.equal(plan.requestedMode, null);
  assert.equal(plan.primaryRepresentation, 'concise_text');
  assert.equal(plan.rendererRequired, false);
  assert.equal(plan.fallback, 'none');
  assert.equal(plan.reason, 'default_teaching');
});
