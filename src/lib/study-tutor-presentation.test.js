import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStudyFlashcards, polishStudyTutorText, studyTutorNudge } from './study-tutor-presentation.js';

test('robotic Study headings are removed while the tutor explanation remains', () => {
  const raw = [
    "**Why it's relevant:** A seatbelt changes your motion when a car brakes.",
    '',
    '**Context-aware question:** What would your body do without the belt?',
  ].join('\n');
  assert.equal(polishStudyTutorText(raw), 'A seatbelt changes your motion when a car brakes.\n\nWhat would your body do without the belt?');
});

test('ordinary human tutor prose passes through unchanged', () => {
  const text = "You feel this whenever a bus stops suddenly. Your body keeps moving because its velocity cannot change without a force. What supplies that force?";
  assert.equal(polishStudyTutorText(text), text);
});

test('passive ready-to-continue endings are removed but actionable prompts survive', () => {
  const raw = [
    'The bowl side of a spoon behaves like a concave mirror.',
    '',
    "Let me know once you're ready, and we'll break down the two types of spherical mirrors.",
  ].join('\n');
  assert.equal(polishStudyTutorText(raw), 'The bowl side of a spoon behaves like a concave mirror.');
  assert.equal(
    polishStudyTutorText("Reflected rays can cross. When you're ready, we'll continue with the focal point."),
    'Reflected rays can cross.',
  );
  const actionable = "When you're ready, calculate the acceleration from 6 m/s to 14 m/s in 4 s.";
  assert.equal(polishStudyTutorText(actionable), actionable);
});

test('tutor nudges still honour the emotional job when the prose provides one', () => {
  assert.deepEqual(studyTutorNudge('Okay — let’s start with what you already know.'), { kind: 'wave', label: 'I’m with you' });
  assert.deepEqual(studyTutorNudge('Exactly — you separated the two forces correctly.'), { kind: 'spark', label: 'Good thinking' });
  assert.deepEqual(studyTutorNudge('You are close, but there is one mix-up in the sign.'), { kind: 'magnify', label: 'Let’s look closer' });
  assert.deepEqual(studyTutorNudge('Try this short practice problem before we continue.'), { kind: 'pencil', label: 'Let’s work it out' });
  assert.deepEqual(studyTutorNudge('Notice how the slope changes here.'), { kind: 'idea', label: 'Notice this' });
});

test('neutral tutor cues follow the current teaching turn instead of repeating Let’s unpack it', () => {
  assert.deepEqual(studyTutorNudge('Here are three Science directions you could choose.', 'you suggest me a topic from Science'), { kind: 'book', label: 'Pick a direction' });
  assert.deepEqual(studyTutorNudge('The inside of the spoon is a concave mirror.', 'Why does the reflection flip in the concave side?'), { kind: 'book', label: 'Here’s the idea' });
  assert.deepEqual(studyTutorNudge('The next useful idea is the focal distance.', 'continue'), { kind: 'idea', label: 'Keep going' });
});

test('picture and flashcard tags do not determine tutor nudge copy', () => {
  const nudge = studyTutorNudge('<quantora-study-picture caption="a braking car" /> Exactly — the seatbelt supplies the force.');
  assert.deepEqual(nudge, { kind: 'spark', label: 'Good thinking' });
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
