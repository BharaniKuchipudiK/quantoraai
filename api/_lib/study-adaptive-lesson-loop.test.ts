import assert from 'node:assert/strict';
import test from 'node:test';
import { planStudyAdaptiveLessonLoop } from './study-adaptive-lesson-loop.js';
import { evaluateStudyLearningIntervention } from './study-learning-intervention.js';
import { planStudyTeachingRepresentation } from './study-teaching-representation.js';

function plan(input: { message: string; contextText?: string; intent?: 'explain' | 'worked_example' | 'practice' | 'diagnose' | 'challenge' | 'verify' | 'plan' | 'continue' }) {
  const contextText = input.contextText || '';
  const history = contextText.split('\n').filter(Boolean).map((text) => ({ role: 'user', text }));
  const intervention = evaluateStudyLearningIntervention({
    message: input.message,
    history,
  });
  const representation = planStudyTeachingRepresentation({
    message: input.message,
    contextText,
    history,
    intervention,
  });
  return planStudyAdaptiveLessonLoop({ intent: input.intent || 'explain', representation, intervention });
}

test('first struggle compresses, asks one check, and waits', () => {
  const result = plan({ message: "I don't understand" });
  assert.deepEqual(result.beats, ['EXPLAIN', 'TRY']);
  assert.equal(result.mustWaitForLearner, true);
  assert.equal(result.maxLearnerQuestions, 1);
});

test('repeated struggle with a supported visual changes to see then predict', () => {
  const result = plan({
    message: "I still don't understand",
    contextText: 'Newton second law and friction\nMake it easier for me',
  });
  assert.deepEqual(result.beats, ['SEE', 'PREDICT']);
  assert.equal(result.mustWaitForLearner, true);
});

test('repeated struggle without a renderer uses a worked repair rather than inventing a visual', () => {
  const result = plan({
    message: "I still don't understand",
    contextText: 'EMF and terminal potential difference\nMake it easier for me',
  });
  assert.deepEqual(result.beats, ['EXPLAIN', 'TRY']);
  assert.equal(result.mustWaitForLearner, true);
});

test('blocked teaching trajectory reconstructs interactively and waits', () => {
  const result = plan({
    message: "I still don't understand",
    contextText: 'Tell me with a story\nI am confused\nShow me an example',
  });
  assert.deepEqual(result.beats, ['PREDICT']);
  assert.equal(result.mustWaitForLearner, true);
  assert.equal(result.reason, 'guided_reconstruction');
});

test('practice and verification never dump the next answer after asking', () => {
  const practice = plan({ message: 'Give me a practice question', intent: 'practice' });
  assert.deepEqual(practice.beats, ['TRY']);
  assert.equal(practice.mustWaitForLearner, true);

  const verify = plan({ message: 'Check whether my answer is correct', intent: 'verify' });
  assert.deepEqual(verify.beats, ['VERIFY', 'TRY']);
  assert.equal(verify.mustWaitForLearner, true);
});

test('generic continuation defers to the authoritative Study teaching-turn policy', () => {
  const result = plan({ message: 'Continue', intent: 'continue' });
  assert.deepEqual(result.beats, []);
  assert.equal(result.mustWaitForLearner, false);
  assert.equal(result.maxLearnerQuestions, 0);
  assert.equal(result.reason, 'continuation_policy');
});

test('ordinary direct explanation is not forced into a fake scripted wait', () => {
  const result = plan({ message: 'What is potential difference?' });
  assert.deepEqual(result.beats, ['EXPLAIN']);
  assert.equal(result.mustWaitForLearner, false);
  assert.equal(result.maxLearnerQuestions, 0);
});
