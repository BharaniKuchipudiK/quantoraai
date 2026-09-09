import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  STUDY_LEARNING_INTERACTION,
  STUDY_LEARNING_INTERACTION_EVENT,
  STUDY_LEARNING_INTERACTION_VERSION,
  recordStudyAnswerChange,
  recordStudyAssessmentOutcome,
  recordStudyHintRequest,
  recordStudyLearningInteraction,
} from './study-learning-interactions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('PR4 contract declares every governed learning interaction family plus PR7 hint progress', () => {
  assert.deepEqual(Object.values(STUDY_LEARNING_INTERACTION).sort(), [
    'answer_changed',
    'hint_depth_used',
    'hint_progress_unlocked',
    'hint_requested',
    'prediction_made',
    'repeated_explanation_requested',
    'response_correct',
    'response_incorrect',
    'retrieval_success',
    'retry_success',
    'simulation_manipulated',
    'visual_requested',
  ]);
});

test('interaction contract keeps only bounded observation fields', () => {
  const event = recordStudyLearningInteraction({
    type: STUDY_LEARNING_INTERACTION.PREDICTION_MADE,
    source: 'linear_function_lab',
    conceptId: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    labKind: 'linear-function',
    choiceId: 'steeper',
    answer: 'raw learner answer must not be copied',
    prompt: 'raw prompt must not be copied',
  }, { now: () => Date.UTC(2026, 8, 9, 2, 0, 0) });

  assert.equal(event.contractVersion, STUDY_LEARNING_INTERACTION_VERSION);
  assert.equal(event.observationOnly, true);
  assert.equal(event.type, 'prediction_made');
  assert.equal(event.conceptId, 'math.linear-functions');
  assert.equal(event.choiceId, 'steeper');
  assert.equal(event.occurredAt, '2026-09-09T02:00:00.000Z');
  assert.equal('answer' in event, false);
  assert.equal('prompt' in event, false);
  assert.equal(Object.isFrozen(event), true);
});

test('unknown interaction kinds fail closed', () => {
  assert.equal(recordStudyLearningInteraction({ type: 'learner_is_bad_at_math' }), null);
});

test('answer changed is emitted only after a real pre-submit change', () => {
  assert.equal(recordStudyAnswerChange({ previousChoiceId: '', nextChoiceId: 'b' }), null);
  assert.equal(recordStudyAnswerChange({ previousChoiceId: 'b', nextChoiceId: 'b' }), null);
  const changed = recordStudyAnswerChange({
    previousChoiceId: 'b',
    nextChoiceId: 'c',
    source: 'assessment_batch',
    attemptId: 'attempt-change',
  });
  assert.equal(changed.type, STUDY_LEARNING_INTERACTION.ANSWER_CHANGED);
  assert.equal(changed.choiceId, 'c');
});

test('hint request records request and bounded depth without copying hint text', () => {
  const recorded = recordStudyHintRequest({ source: 'guided_chip', hintDepth: 99, conceptId: 'physics.motion' });
  assert.equal(recorded.length, 2);
  assert.deepEqual(recorded.map((event) => event.type), ['hint_requested', 'hint_depth_used']);
  assert.equal(recorded[1].hintDepth, 6);
});

test('verified outcome stays observational and emits retrieval success only for correct retrieval', () => {
  const recorded = recordStudyAssessmentOutcome({
    attemptId: 'attempt-1',
    result: {
      correct: true,
      evidenceKind: 'retrieval',
      evidenceConcept: { key: 'physics.newton-2', label: "Newton's second law" },
      mastery: { status: 'mastered' },
      learnerModel: { confidence: 0.99 },
    },
  });
  assert.deepEqual(recorded.map((event) => event.type), ['response_correct', 'retrieval_success']);
  assert.equal(recorded[0].correct, true);
  assert.equal(recorded[0].evidenceKind, 'retrieval');
  assert.equal('mastery' in recorded[0], false);
  assert.equal('learnerModel' in recorded[0], false);
});

test('hint progress requires explicit retry plus verified success rather than temporal correlation', () => {
  const ordinary = recordStudyAssessmentOutcome({
    attemptId: 'attempt-2',
    hintDepth: 4,
    result: { correct: true, evidenceKind: 'assessment_item', evidenceConcept: { key: 'math.linear-functions' } },
  });
  assert.equal(ordinary.some((event) => event.type === STUDY_LEARNING_INTERACTION.RETRY_SUCCESS), false);
  assert.equal(ordinary.some((event) => event.type === STUDY_LEARNING_INTERACTION.HINT_PROGRESS_UNLOCKED), false);

  const failedRetry = recordStudyAssessmentOutcome({
    attemptId: 'attempt-3',
    retry: true,
    hintDepth: 4,
    result: { correct: false, evidenceKind: 'assessment_item', evidenceConcept: { key: 'math.linear-functions' } },
  });
  assert.equal(failedRetry.some((event) => event.type === STUDY_LEARNING_INTERACTION.HINT_PROGRESS_UNLOCKED), false);

  const retryWithoutHint = recordStudyAssessmentOutcome({
    attemptId: 'attempt-no-hint',
    retry: true,
    hintDepth: 0,
    result: { correct: true, evidenceKind: 'assessment_item', evidenceConcept: { key: 'math.linear-functions' } },
  });
  assert.equal(retryWithoutHint.some((event) => event.type === STUDY_LEARNING_INTERACTION.RETRY_SUCCESS), true);
  assert.equal(retryWithoutHint.some((event) => event.type === STUDY_LEARNING_INTERACTION.HINT_PROGRESS_UNLOCKED), false);

  const retry = recordStudyAssessmentOutcome({
    attemptId: 'attempt-4',
    retry: true,
    hintDepth: 4,
    result: { correct: true, evidenceKind: 'assessment_item', evidenceConcept: { key: 'math.linear-functions' } },
  });
  const unlocked = retry.find((event) => event.type === STUDY_LEARNING_INTERACTION.HINT_PROGRESS_UNLOCKED);
  assert.equal(retry.some((event) => event.type === STUDY_LEARNING_INTERACTION.RETRY_SUCCESS), true);
  assert.equal(unlocked?.hintDepth, 4);
  assert.equal(unlocked?.retry, true);
});

test('browser event carries the exact frozen observation without storing a second copy', () => {
  const previousWindow = globalThis.window;
  const dispatched = [];
  globalThis.window = {
    CustomEvent: class FakeCustomEvent {
      constructor(type, init) { this.type = type; this.detail = init.detail; }
    },
    dispatchEvent(event) { dispatched.push(event); return true; },
  };
  try {
    const recorded = recordStudyLearningInteraction({ type: STUDY_LEARNING_INTERACTION.VISUAL_REQUESTED, source: 'study_hub' });
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].type, STUDY_LEARNING_INTERACTION_EVENT);
    assert.equal(dispatched[0].detail, recorded);
    assert.equal(Object.isFrozen(dispatched[0].detail), true);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('Study signal wiring covers adaptive hint depth without persistence or a mastery writer', () => {
  const contract = read('src/lib/study-learning-interactions.js');
  const evidenceClient = read('src/lib/study-evidence-client.js');
  const tutor = read('src/components/StudyTutorWorkspace.jsx');
  const hub = read('src/components/StudyHubLauncher.jsx');
  const chips = read('src/components/StudioInlineSuggestions.jsx');
  const assessment = read('src/components/StudyAssessmentWorkspace.jsx');
  const mathLab = read('src/components/StudyLinearFunctionLab.jsx');
  const physicsLab = read('src/components/StudyVisualLab.jsx');

  assert.doesNotMatch(contract, /fetch\s*\(/);
  assert.doesNotMatch(contract, /localStorage|sessionStorage|study_mastery_events|masteryUpdated|const events\s*=|events\.push/);
  assert.match(evidenceClient, /recordStudyAssessmentOutcome/);
  assert.match(evidenceClient, /retry:\s*retry === true/);
  assert.match(tutor, /retry:\s*loop\.explicitRetry === true/);
  assert.match(tutor, /readStudyWorkingState\(\)\?\.hintDepth/);
  assert.match(hub, /REPEATED_EXPLANATION_REQUESTED/);
  assert.match(hub, /VISUAL_REQUESTED/);
  assert.match(chips, /import\('\.\.\/lib\/study-working-state\.js'\)/);
  assert.match(chips, /import\('\.\.\/lib\/study-learning-interactions\.js'\)/);
  assert.match(chips, /nextStudyHintDepth/);
  assert.match(chips, /recordStudyHintRequest/);
  assert.match(assessment, /recordStudyAnswerChange/);
  assert.match(mathLab, /PREDICTION_MADE/);
  assert.match(mathLab, /SIMULATION_MANIPULATED/);
  assert.match(physicsLab, /recordLabManipulation/);
  assert.match(physicsLab, /SIMULATION_MANIPULATED/);
});
