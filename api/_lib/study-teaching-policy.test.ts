import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_TEACHING_POLICY_VERSION,
  STUDY_TEACHING_TURN_DIRECTIVE,
} from './study-teaching-policy.js';

test('Study teaching policy is versioned and finite', () => {
  assert.match(STUDY_TEACHING_POLICY_VERSION, /^study-teaching-policy-/);
  for (const kind of ['TOPIC_SELECTION', 'NEW_CONCEPT', 'DIRECT_QUESTION', 'CONTINUATION', 'LEARNER_ATTEMPT']) {
    assert.match(STUDY_TEACHING_TURN_DIRECTIVE, new RegExp(`\\b${kind}\\b`));
  }
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /HOOK → PREDICT → SEE → EXPLAIN → TRY → VERIFY → EXAM_READY/);
});

test('direct questions are answer-first rather than artificially Socratic', () => {
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /DIRECT_QUESTION: ANSWER THE QUESTION FIRST/i);
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /Never withhold the answer just to make the learner predict/i);
});

test('new concepts use real-world intuition without forcing a readiness handshake', () => {
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /NEW_CONCEPT: begin with one familiar, factually correct observation/i);
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /Never demand “say you’re ready”/i);
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /spoon reflection.*bus braking.*straw in water/is);
});

test('visual and mastery truth fail closed', () => {
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /Skip the visual when.*needed to make it correct is not established/is);
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /correct conversational answer.*not automatically verified mastery/is);
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /verified assessment\/learner-model evidence.*outranks prose impressions/is);
});

test('exam-ready language comes after intuition unless explicitly requested', () => {
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /EXAM_READY/);
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /come AFTER intuition.*unless the learner explicitly asked/is);
});

test('the policy rejects passive ready-to-continue closers', () => {
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /No “let me know when you’re ready”/i);
  assert.match(STUDY_TEACHING_TURN_DIRECTIVE, /If you ask a question, end on the question itself/i);
});
