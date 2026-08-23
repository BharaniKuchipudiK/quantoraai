import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decorateStudyMessage,
  inferStudyPictureSubject,
  splitStudySegments,
  studyPicturePromptHint,
  suggestStudyPictureKind,
} from './study-pictures.js';

test('Study picture tags become real segments, not markdown text', () => {
  const parts = splitStudySegments(
    'Hook.\n<quantora-study-picture kind="apple-tree" caption="The apple" />\nThen wait.',
    "Newton's first law of motion",
  );
  assert.equal(parts[1].type, 'picture');
  assert.equal(parts[1].kind, 'apple-tree');
  assert.equal(parts[1].caption, 'The apple');
});

test('a promised visual workspace becomes a real in-chat lab', () => {
  const decorated = decorateStudyMessage('What has been added to your visual workspace: Dedicated FBD Vector Tab.');
  assert.match(decorated, /quantora-study-lab kind="fbd"/);
  const parts = splitStudySegments(decorated);
  assert.equal(parts[0].type, 'lab');
  assert.equal(parts[0].kind, 'fbd');
});

test('Algebra is not Newton, a falling apple, or a book on a table', () => {
  assert.equal(inferStudyPictureSubject('What is Algebra?'), 'algebra');
  assert.equal(suggestStudyPictureKind('What is Algebra?'), 'mystery-box');
  assert.match(studyPicturePromptHint('Algebra'), /mystery-box/);
  assert.doesNotMatch(studyPicturePromptHint('Algebra'), /kind="apple-tree"/);

  const ice = decorateStudyMessage(
    'Algebra is arithmetic with a mystery box. x + 3 = 5.',
    'What is Algebra?',
  );
  assert.match(ice, /kind="mystery-box"|kind="balance-scale"/);
  assert.doesNotMatch(ice, /apple-tree|book-table|truck-car/);

  const leaked = splitStudySegments(
    '<quantora-study-picture kind="book-table" />\nKeep both sides of the equation balanced. What is the value of $x-8=15$?',
    'What is Algebra?',
  );
  assert.equal(leaked[0].type, 'picture');
  assert.equal(leaked[0].kind, 'balance-scale');
  assert.doesNotMatch(leaked[0].caption, /Newton|two forces|book at rest/i);

  const leakedTruck = splitStudySegments(
    '<quantora-study-picture kind="truck-car" />\nNo more images or tags. Back to the problem: $x - 8 = 15$. To find $x$, undo the subtraction by adding 8 to both sides.',
    'What is Algebra?',
  );
  assert.equal(leakedTruck[0].kind, 'balance-scale');
  assert.doesNotMatch(leakedTruck[0].caption, /Truck vs car|accelerat|Newton/i);

  const appleLeak = splitStudySegments(
    '<quantora-study-picture kind="apple-tree" caption="Newton under the tree — why does the apple fall the same way every time?" />\nAlgebra is a mystery box.',
    'What is Algebra?',
  );
  assert.equal(appleLeak[0].kind, 'mystery-box');
  assert.doesNotMatch(appleLeak[0].caption, /Newton|apple fall/i);
});

test('an apple counting analogy does not become Isaac Newton', () => {
  const decorated = decorateStudyMessage('Three apples in a box is just counting. This is not a force.');
  assert.doesNotMatch(decorated, /apple-tree|quantora-study-picture/);
});

test('Newton lessons still get mechanics pictures', () => {
  const decorated = decorateStudyMessage(
    'Inertia: a puck keeps moving until a force acts.',
    "Newton's first law of motion",
  );
  assert.match(decorated, /apple-tree|ice-puck/);
});
