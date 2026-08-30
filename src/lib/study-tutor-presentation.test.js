import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStudyFlashcards, polishStudyTutorText } from './study-tutor-presentation.js';

test('robotic Study headings are removed while the tutor explanation remains', () => {
  const raw = [
    "**Why it's relevant:** A seatbelt changes your motion when a car brakes.",
    '',
    '**Context-aware question:** What would your body do without the belt?',
  ].join('\n');
  const polished = polishStudyTutorText(raw);
  assert.equal(polished, 'A seatbelt changes your motion when a car brakes.\n\nWhat would your body do without the belt?');
});

test('ordinary human tutor prose passes through unchanged', () => {
  const text = "You feel this whenever a bus stops suddenly. Your body keeps moving because its velocity cannot change without a force. What supplies that force?";
  assert.equal(polishStudyTutorText(text), text);
});

test('a static Front/Back table is upgraded into hidden-answer flashcard tags', () => {
  const table = [
    'Flashcard set',
    '| Front | Back |',
    '| --- | --- |',
    '| 1. What is inertia? | Resistance to a change in velocity. |',
    '| 2. Is inertia a force? | No. It is a property of mass. |',
  ].join('\n');
  const normalized = normalizeStudyFlashcards(table);
  assert.doesNotMatch(normalized, /\| Front \| Back \|/);
  assert.equal((normalized.match(/quantora-study-flashcard/g) || []).length, 2);
  assert.match(normalized, /front="What is inertia\?"/);
});
