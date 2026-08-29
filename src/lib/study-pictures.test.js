import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decorateStudyMessage,
  pictureCaptionFitsLesson,
  splitStudySegments,
  studyPicturePromptHint,
  studyVisualKind,
  wantsStudyLab,
} from './study-pictures.js';

test('Study picture tags become real segments from the caption, not a stock kind', () => {
  const parts = splitStudySegments(
    'Hook.\n<quantora-study-picture caption="A box holding the unknown in x + 3 = 5" />\nThen wait.',
    'What is Algebra?',
  );
  assert.equal(parts[1].type, 'picture');
  assert.match(parts[1].caption, /unknown/);
});

test('a lab tag only renders when this conversation is actually that lab', () => {
  const newton = decorateStudyMessage(
    '<quantora-study-lab kind="fbd" />\nPush on the crate.',
    "Newton's laws of motion",
  );
  assert.match(newton, /quantora-study-lab kind="fbd"/);
  const algebra = decorateStudyMessage(
    '<quantora-study-lab kind="newton" />\nSolve x - 8 = 15.',
    'What is Algebra?',
  );
  assert.doesNotMatch(algebra, /quantora-study-lab/);
});

test('Algebra never keeps leftover Newton stock scenes', () => {
  assert.equal(pictureCaptionFitsLesson(
    'Newton under the tree — why does the apple fall the same way every time?',
    'What is Algebra?',
    'x - 8 = 15',
  ), false);
  assert.doesNotMatch(studyPicturePromptHint('Algebra'), /apple-tree|book-table|truck-car/);

  const leaked = splitStudySegments(
    '<quantora-study-picture kind="book-table" />\nKeep both sides of the equation balanced. What is the value of $x-8=15$?',
    'What is Algebra?',
  );
  assert.equal(leaked.some((part) => part.type === 'picture'), false);

  const leakedTruck = splitStudySegments(
    '<quantora-study-picture kind="truck-car" />\nNo more images or tags. Back to the problem: $x - 8 = 15$.',
    'What is Algebra?',
  );
  assert.equal(leakedTruck.some((part) => part.type === 'picture'), false);

  const appleLeak = splitStudySegments(
    '<quantora-study-picture kind="apple-tree" caption="Newton under the tree — why does the apple fall the same way every time?" />\nAlgebra is a mystery box.',
    'What is Algebra?',
  );
  assert.equal(appleLeak.some((part) => part.type === 'picture'), false);
});

test('the client does not invent a picture from the word apple', () => {
  const decorated = decorateStudyMessage('Three apples in a box is just counting.');
  assert.doesNotMatch(decorated, /quantora-study-picture|apple-tree/);
});

test('a model caption about this Algebra turn is kept', () => {
  const parts = splitStudySegments(
    '<quantora-study-picture caption="Undo subtraction by adding the same number to both sides" />\n$$x - 8 = 15$$',
    'What is Algebra?',
  );
  assert.equal(parts[0].type, 'picture');
  assert.match(parts[0].caption, /both sides/);
});

test('wantsStudyLab does not treat a generic visual as Newton', () => {
  assert.equal(wantsStudyLab('Add a visual workspace for this idea'), false);
  assert.equal(wantsStudyLab('Open the free-body diagram lab'), true);
});

test('Study visuals are subject-aware teaching diagrams', () => {
  assert.equal(studyVisualKind('A box accelerating under a net force'), 'physics-motion');
  assert.equal(studyVisualKind('Keep both sides of the equation balanced'), 'algebra-balance');
  assert.equal(studyVisualKind('The nucleus sits inside the cell membrane'), 'biology-cell');
  assert.equal(studyVisualKind('The slope of a displacement-time graph'), 'graph');
});
