import assert from 'node:assert/strict';
import test from 'node:test';
import {
  studyTeachingTurnKind,
  studyTeachingTurnNudge,
  studyTeachingUserTurns,
} from './study-teaching-turn.js';

test('Study-owned facts are not mistaken for learner turns', () => {
  assert.deepEqual(studyTeachingUserTurns([
    'Syllabus overlay: CBSE Class 10.',
    'Study subject: Science',
    'Teach me reflection and refraction',
  ].join('\n')), ['Teach me reflection and refraction']);
});

test('topic selection is distinct from starting a concept', () => {
  assert.equal(studyTeachingTurnKind('you suggest me a topic from Science'), 'topic_selection');
  assert.equal(studyTeachingTurnKind('Teach me reflection and refraction'), 'new_concept');
  assert.equal(studyTeachingTurnKind('Light: Reflection & Refraction'), 'new_concept');
});

test('a concrete why question is answer-first territory', () => {
  assert.equal(
    studyTeachingTurnKind('Light: Reflection & Refraction\nWhy does the reflection flip in the concave side?'),
    'direct_question',
  );
  assert.deepEqual(studyTeachingTurnNudge('direct_question'), { kind: 'book', label: 'Here’s the idea' });
});

test('ready and continue progress the same concept instead of restarting the hook', () => {
  assert.equal(studyTeachingTurnKind('Teach me reflection\nready'), 'continuation');
  assert.equal(studyTeachingTurnKind('Teach me reflection\ncontinue'), 'continuation');
  assert.deepEqual(studyTeachingTurnNudge('continuation'), { kind: 'idea', label: 'Keep going' });
});

test('learner attempts are recognised from the tutor evaluation response', () => {
  assert.equal(
    studyTeachingTurnKind('Teach me inertia\nThe seatbelt provides the force', 'Exactly — the seatbelt supplies the force that changes your velocity.'),
    'learner_attempt',
  );
  assert.deepEqual(studyTeachingTurnNudge('learner_attempt'), { kind: 'pencil', label: 'Check the reasoning' });
});

test('turn-specific neutral cues replace the repeated unpack label', () => {
  assert.deepEqual(studyTeachingTurnNudge('topic_selection'), { kind: 'book', label: 'Pick a direction' });
  assert.deepEqual(studyTeachingTurnNudge('new_concept'), { kind: 'idea', label: 'Start with something familiar' });
  assert.notEqual(studyTeachingTurnNudge('direct_question').label, 'Let’s unpack it');
});
