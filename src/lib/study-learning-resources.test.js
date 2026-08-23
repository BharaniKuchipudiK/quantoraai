import assert from 'node:assert/strict';
import test from 'node:test';
import {
  studyFlashcardAsk,
  studyIcebreakerAsk,
  studyLessonAsk,
  studyNotesAsk,
  studyQuizAsk,
  studyResourceLinks,
} from './study-learning-resources.js';

test('resource links are official search pages, not invented videos', () => {
  const links = studyResourceLinks("Newton's laws");
  assert.equal(links.length, 5);
  assert.ok(links.every((item) => /^https:\/\//.test(item.href)));
  assert.ok(links.find((item) => item.id === 'khan').href.includes('khanacademy.org'));
  assert.ok(links.find((item) => item.id === 'swayam').href.includes('swayam.gov.in'));
  assert.ok(links.find((item) => item.id === 'notebooklm').href.includes('notebooklm.google.com'));
  assert.doesNotMatch(links.map((item) => item.href).join(' '), /watch\?v=/);
});

test('lesson, quiz, flashcards, and notes asks stay tutor-like and fail-closed on fake videos', () => {
  assert.match(studyIcebreakerAsk("Newton's laws"), /I’m with you|I'm with you/);
  assert.match(studyIcebreakerAsk("Newton's laws"), /Do not plan trips/i);
  assert.match(studyIcebreakerAsk("Newton's laws"), /quantora-study-picture/);
  assert.match(studyIcebreakerAsk("Newton's laws"), /caption=/);
  assert.doesNotMatch(studyIcebreakerAsk('Algebra'), /apple-tree|book-table|truck-car/);
  assert.doesNotMatch(studyLessonAsk('Algebra'), /all three laws|apple-tree/);
  assert.match(studyLessonAsk("Newton's laws"), /ONE idea|one idea/i);
  assert.match(studyLessonAsk("Newton's laws"), /Do not invent a specific YouTube/i);
  assert.match(studyQuizAsk("Newton's laws"), /Wait for my answers/i);
  assert.match(studyFlashcardAsk("Newton's laws"), /flashcards/i);
  assert.match(studyNotesAsk("Newton's laws"), /NotebookLM/i);
});
