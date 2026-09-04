import assert from 'node:assert/strict';
import test from 'node:test';
import { studyTeachingBeatViolations } from './study-teaching-beat.js';

test('a one-idea beat with one question is allowed', () => {
  const beat = 'Split the resultant into horizontal and vertical components first. Predict which component increases when the angle increases, then answer that one check.';
  assert.deepEqual(studyTeachingBeatViolations(beat), []);
});

test('a chapter dump is rejected for questions, definitions, topic lists, and length', () => {
  const chapter = [
    'Definition: velocity is defined as change in displacement over time.',
    'Definition: acceleration is defined as change in velocity over time.',
    'Force is defined as mass times acceleration.',
    '1. Kinematics across a full chapter of motion graphs and SUVAT.',
    '2. Dynamics including every Newton law and friction case.',
    '3. Energy including work, power, and conservation in every form.',
    `${'This lecture continues in the same voice for hundreds of filler words so the beat is a chapter rather than one idea. '.repeat(24)}`,
    'What is velocity? What is acceleration? What is energy?',
  ].join(' ');
  const violations = studyTeachingBeatViolations(chapter);
  assert.deepEqual(
    new Set(violations),
    new Set(['multiple_questions', 'multi_topic_list', 'definition_dump', 'chapter_length']),
  );
});

test('a short unsupported fallback with one action is allowed', () => {
  const beat = [
    'No safe native visual renderer exists for this concept yet, so I will keep this concise and structured rather than pretending a diagram exists.',
    '',
    'State one concrete trade-off from the scenario in one sentence.',
  ].join('\n');
  assert.deepEqual(studyTeachingBeatViolations(beat), []);
});
