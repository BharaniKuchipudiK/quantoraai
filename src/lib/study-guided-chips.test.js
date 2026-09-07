import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyStudyGuidedState, studyGuidedChipBeats } from './study-guided-chips.js';

function labels(beats) {
  return beats.map((beat) => beat.label);
}

test('a lesson gets fresh guided choices without needing a model continue marker', () => {
  const beats = studyGuidedChipBeats({
    userPrompt: 'Teach me Newton’s second law',
    aiResponse: 'Newton’s second law connects net force, mass, and acceleration. A larger net force produces a larger acceleration for the same mass, while a larger mass needs more force for the same acceleration. Think of pushing an empty trolley versus a loaded trolley.',
  });
  assert.equal(classifyStudyGuidedState({
    userPrompt: 'Teach me Newton’s second law',
    aiResponse: 'Newton’s second law connects net force, mass, and acceleration. A larger net force produces a larger acceleration for the same mass, while a larger mass needs more force for the same acceleration. Think of pushing an empty trolley versus a loaded trolley.',
  }), 'lesson');
  assert.deepEqual(labels(beats), [
    'Let’s work through it together',
    'Let me try',
    'Show another example',
  ]);
});

test('a concise but meaningful explanation still gets guided choices', () => {
  const beats = studyGuidedChipBeats({
    userPrompt: 'What is inertia?',
    aiResponse: 'Inertia is an object’s tendency to resist a change in its motion.',
  });
  assert.equal(beats[0].state, 'lesson');
  assert.ok(labels(beats).includes('Let me try'));
});

test('a tutor question prioritizes hint, guided work, and an independent attempt', () => {
  const beats = studyGuidedChipBeats({
    userPrompt: 'Continue',
    aiResponse: 'A 2 kg object experiences a net force of 6 N. What acceleration does it have?',
  });
  assert.equal(beats[0].state, 'question');
  assert.deepEqual(labels(beats), [
    'Give me a hint',
    'Let’s work through it together',
    'Let me try',
  ]);
});

test('misconception repair stays repair-focused even when the tutor ends with a guiding question', () => {
  const beats = studyGuidedChipBeats({
    userPrompt: 'I think acceleration is 12 m/s²',
    aiResponse: 'Not quite. You multiplied force by mass, but Newton’s second law requires dividing net force by mass. Which operation should you use instead?',
  });
  assert.equal(beats[0].state, 'misconception');
  assert.deepEqual(labels(beats), [
    'Let’s work through it together',
    'Give me a hint',
    'Show another example',
  ]);
});

test('an interrupted partial reply preserves the canonical resume action instead of generating Study beats', () => {
  const aiResponse = [
    'Newton’s second law connects force, mass, and acceleration, so the next step is to isolate acceleration before substituting values.',
    '⚠️ _The reply was cut off here — the model route dropped mid-answer. Nothing above is lost; tap **Continue** and I’ll pick up from this point._',
  ].join('\n\n');
  assert.equal(classifyStudyGuidedState({ userPrompt: 'Teach me Newton’s second law', aiResponse }), null);
  assert.deepEqual(studyGuidedChipBeats({ userPrompt: 'Teach me Newton’s second law', aiResponse }), []);
});

test('a Learning Compass recommendation gets recommendation-specific choices without scheduling side effects', () => {
  const beats = studyGuidedChipBeats({
    userPrompt: 'What should I study next?',
    aiResponse: 'Learning Compass recommends revisiting free-body diagrams next because this concept is currently blocking your force problems and has stronger evidence of a gap than the other candidates.',
  });
  assert.equal(beats[0].state, 'recommendation');
  assert.deepEqual(labels(beats), [
    'Let’s work through it together',
    'Why this first?',
    'Let me try',
  ]);
  assert.equal(beats.some((beat) => /schedule/i.test(`${beat.label} ${beat.value}`)), false);
});

test('a newer learning state supersedes the old state instead of carrying stale choices forward', () => {
  const recommendation = studyGuidedChipBeats({
    userPrompt: 'What should I study next?',
    aiResponse: 'I recommend free-body diagrams as your next learning action because they unblock the next mechanics concepts.',
  });
  const question = studyGuidedChipBeats({
    userPrompt: recommendation[0].value,
    aiResponse: 'Draw the forces on a block resting on a horizontal table. Which two forces act vertically?',
  });

  assert.ok(labels(recommendation).includes('Why this first?'));
  assert.equal(labels(question).includes('Why this first?'), false);
  assert.ok(labels(question).includes('Give me a hint'));
});

test('guided chips are deterministic, unique, and bounded to three', () => {
  const input = {
    userPrompt: 'Explain photosynthesis',
    aiResponse: 'Photosynthesis converts light energy into stored chemical energy. Plants use carbon dioxide and water to form glucose, releasing oxygen as a by-product. The light-dependent reactions and carbon-fixation reactions play different roles in that overall process.',
  };
  const first = studyGuidedChipBeats(input);
  const second = studyGuidedChipBeats(input);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map((beat) => beat.id)).size, first.length);
  assert.equal(new Set(labels(first).map((label) => label.toLowerCase())).size, first.length);
});

test('errors, transport failures, and syllabus-only chrome do not create sticky learning chips', () => {
  assert.deepEqual(studyGuidedChipBeats({ aiResponse: 'Temporarily unavailable. Please try again later.' }), []);
  assert.deepEqual(studyGuidedChipBeats({ aiResponse: 'Which syllabus would you like to use?' }), []);
  assert.deepEqual(studyGuidedChipBeats({ aiResponse: 'Okay.' }), []);
});
