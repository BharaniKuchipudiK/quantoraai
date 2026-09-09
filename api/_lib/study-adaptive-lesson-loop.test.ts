import assert from 'node:assert/strict';
import test from 'node:test';
import { planStudyAdaptiveLessonLoop } from './study-adaptive-lesson-loop.js';
import { evaluateStudyLearningIntervention } from './study-learning-intervention.js';
import { planStudyTeachingRepresentation } from './study-teaching-representation.js';

function plan(input: { message: string; contextText?: string; intent?: 'explain' | 'worked_example' | 'practice' | 'diagnose' | 'challenge' | 'verify' | 'plan' | 'continue'; history?: Array<{ role: string; text: string }> }) {
  const contextText = input.contextText || '';
  const history = input.history || contextText.split('\n').filter(Boolean).map((text) => ({ role: 'user', text }));
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

test('repeated Electricity struggle changes to see then predict', () => {
  const result = plan({
    message: "I still don't understand",
    contextText: 'EMF and terminal potential difference\nMake it easier for me',
  });
  assert.deepEqual(result.beats, ['SEE', 'PREDICT']);
  assert.equal(result.mustWaitForLearner, true);
});

test('repeated struggle without a renderer uses a worked repair rather than inventing a visual', () => {
  const result = plan({
    message: "I still don't understand",
    contextText: 'opportunity cost and trade-offs\nMake it easier for me',
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

test('suitable dynamic concept starts prediction-first before explanation', () => {
  const result = plan({ message: 'What is terminal potential difference?' });
  assert.deepEqual(result.beats, ['PREDICT']);
  assert.equal(result.reason, 'prediction_first');
  assert.equal(result.mustWaitForLearner, true);
});

test('response to prior prediction advances through observe confront explain verify without learner-truth claims', () => {
  const result = plan({
    message: 'I think it will increase',
    history: [
      { role: 'user', text: 'Explain terminal potential difference' },
      { role: 'assistant', text: 'Prediction first — what do you think will happen to terminal voltage as current increases?' },
    ],
  });
  assert.deepEqual(result.beats, ['SEE', 'CONFRONT', 'EXPLAIN', 'VERIFY']);
  assert.equal(result.reason, 'prediction_first');
  assert.equal(result.mustWaitForLearner, true);
});

test('explicit representation request remains authoritative and is not delayed by prediction-first policy', () => {
  const result = plan({ message: 'Show me a diagram of a circuit and terminal potential difference' });
  assert.equal(result.reason, 'explicit_representation');
  assert.notDeepEqual(result.beats, ['PREDICT']);
});

test('ordinary direct explanation is not forced into prediction-first for unsupported concepts', () => {
  const result = plan({ message: 'What is opportunity cost?' });
  assert.deepEqual(result.beats, ['EXPLAIN']);
  assert.equal(result.mustWaitForLearner, false);
  assert.equal(result.maxLearnerQuestions, 0);
});
