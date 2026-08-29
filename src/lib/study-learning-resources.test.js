import assert from 'node:assert/strict';
import test from 'node:test';
import {
  studyApplicationAsk,
  studyFlashcardAsk,
  studyIcebreakerAsk,
  studyLessonAsk,
  studyNotesAsk,
  studyPlanAsk,
  studyPracticeAsk,
  studyQuizAsk,
} from './study-learning-resources.js';

test('Study asks stay context-aware and fail closed on invented media', () => {
  assert.match(studyIcebreakerAsk("Newton's laws"), /signal that I am ready/i);
  assert.match(studyIcebreakerAsk("Newton's laws"), /Do not plan trips/i);
  assert.match(studyIcebreakerAsk("Newton's laws"), /quantora-study-picture/);
  assert.match(studyIcebreakerAsk("Newton's laws"), /caption=/);
  assert.doesNotMatch(studyIcebreakerAsk('Algebra'), /apple-tree|book-table|truck-car/);
  assert.doesNotMatch(studyLessonAsk('Algebra'), /all three laws|apple-tree/);
  assert.match(studyLessonAsk("Newton's laws"), /ONE idea|one idea/i);
  assert.match(studyLessonAsk("Newton's laws"), /current conversation/i);
  assert.match(studyLessonAsk("Newton's laws"), /Do not invent a specific YouTube/i);
  assert.match(studyQuizAsk("Newton's laws"), /current conversation/i);
  assert.match(studyPracticeAsk("Newton's laws"), /current conversation/i);
  assert.match(studyFlashcardAsk("Newton's laws"), /current conversation/i);
  assert.match(studyApplicationAsk("Newton's laws"), /current learning context/i);
  assert.match(studyPlanAsk("Newton's laws"), /context already known/i);
  assert.match(studyNotesAsk("Newton's laws"), /actually established/i);
});
