import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  STUDY_LEARNING_INTERACTION,
  STUDY_LEARNING_INTERACTION_EVENT,
  STUDY_LEARNING_INTERACTION_LIMIT,
  STUDY_LEARNING_INTERACTION_VERSION,
  clearStudyLearningInteractions,
  normalizeStudyLearningInteraction,
  readStudyLearningInteractions,
  recordStudyAssessmentOutcome,
  recordStudyHintRequest,
  recordStudyLearningInteraction,
} from './study-learning-interactions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('interaction contract keeps only bounded observation fields', () => {
  clearStudyLearningInteractions();
  const event = normalizeStudyLearningInteraction({
    type: STUDY_LEARNING_INTERACTION.PREDICTION_MADE,
    source: 'linear_function_lab',
    conceptId: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    labKind: 'linear-function',
    choiceId: 'steeper',
    answer: 'raw learner answer must not be copied',
    prompt: 'raw prompt must not be copied',
  }, () => Date.UTC(2026, 8, 9, 2, 0, 0));

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
  clearStudyLearningInteractions();
  assert.equal(recordStudyLearningInteraction({ type: 'learner_is_bad_at_math' }), null);
  assert.deepEqual(readStudyLearningInteractions(), []);
});

test('hint request records request and bounded depth without copying hint text', () => {
  clearStudyLearningInteractions();
  const recorded = recordStudyHintRequest({ source: 'guided_chip', hintDepth: 99, conceptId: 'physics.motion' });
  assert.equal(recorded.length, 2);
  assert.deepEqual(recorded.map((event) => event.type), ['hint_requested', 'hint_depth_used']);
  assert.equal(recorded[1].hintDepth, 6);
});

test('verified outcome stays observational and emits retrieval success only for correct retrieval', () => {
  clearStudyLearningInteractions();
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

test('retry success requires explicit retry context rather than inferring from a later correct answer', () => {
  clearStudyLearningInteractions();
  const ordinary = recordStudyAssessmentOutcome({
    attemptId: 'attempt-2',
    result: { correct: true, evidenceKind: 'assessment_item', evidenceConcept: { key: 'math.linear-functions' } },
  });
  assert.equal(ordinary.some((event) => event.type === STUDY_LEARNING_INTERACTION.RETRY_SUCCESS), false);

  const retry = recordStudyAssessmentOutcome({
    attemptId: 'attempt-3',
    retry: true,
    result: { correct: true, evidenceKind: 'assessment_item', evidenceConcept: { key: 'math.linear-functions' } },
  });
  assert.equal(retry.some((event) => event.type === STUDY_LEARNING_INTERACTION.RETRY_SUCCESS), true);
});

test('journal is bounded and queryable by concept', () => {
  clearStudyLearningInteractions();
  for (let index = 0; index < STUDY_LEARNING_INTERACTION_LIMIT + 20; index += 1) {
    recordStudyLearningInteraction({
      type: STUDY_LEARNING_INTERACTION.VISUAL_REQUESTED,
      source: 'study_hub',
      conceptId: index % 2 ? 'a' : 'b',
    });
  }
  assert.equal(readStudyLearningInteractions().length, STUDY_LEARNING_INTERACTION_LIMIT);
  assert.ok(readStudyLearningInteractions({ conceptId: 'a' }).every((event) => event.conceptId === 'a'));
});

test('browser event is same observation appended to journal', () => {
  clearStudyLearningInteractions();
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
    assert.equal(dispatched[0].detail.id, recorded.id);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('PR4 signal wiring covers real Study actions without a persistence or mastery writer', () => {
  const contract = read('src/lib/study-learning-interactions.js');
  const evidenceClient = read('src/lib/study-evidence-client.js');
  const hub = read('src/components/StudyHubLauncher.jsx');
  const chips = read('src/components/StudioInlineSuggestions.jsx');
  const assessment = read('src/components/StudyAssessmentWorkspace.jsx');
  const lab = read('src/components/StudyLinearFunctionLab.jsx');

  assert.doesNotMatch(contract, /fetch\s*\(/);
  assert.doesNotMatch(contract, /localStorage|sessionStorage|study_mastery_events|masteryUpdated/);
  assert.match(evidenceClient, /recordStudyAssessmentOutcome/);
  assert.match(hub, /REPEATED_EXPLANATION_REQUESTED/);
  assert.match(hub, /VISUAL_REQUESTED/);
  assert.match(chips, /recordStudyHintRequest/);
  assert.match(assessment, /ANSWER_CHANGED/);
  assert.match(lab, /PREDICTION_MADE/);
  assert.match(lab, /SIMULATION_MANIPULATED/);
});
