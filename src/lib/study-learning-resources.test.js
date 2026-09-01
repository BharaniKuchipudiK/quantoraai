import assert from 'node:assert/strict';
import test from 'node:test';
import {
  studyApplicationAsk,
  studyActionVisibleText,
  studyExplainDifferentlyAsk,
  studyFlashcardAsk,
  studyIcebreakerAsk,
  studyLessonAsk,
  studyNotesAsk,
  studyPlanAsk,
  studyPracticeAsk,
  studyQuizAsk,
  studyRealWorldAsk,
  studyVisualExplainAsk,
  studyWhereNextAsk,
} from './study-learning-resources.js';

test('Study asks stay context-aware and fail closed on invented media', () => {
  assert.match(studyIcebreakerAsk("Newton's laws"), /ask ONE short question/i);
  assert.match(studyIcebreakerAsk("Newton's laws"), /STOP/i);
  assert.match(studyIcebreakerAsk("Newton's laws"), /Do not plan trips/i);
  assert.match(studyIcebreakerAsk("Newton's laws"), /quantora-study-picture/);
  assert.match(studyIcebreakerAsk("Newton's laws"), /caption=/);
  assert.doesNotMatch(studyIcebreakerAsk('Algebra'), /apple-tree|book-table|truck-car/);
  assert.doesNotMatch(studyLessonAsk('Algebra'), /all three laws|apple-tree/);
  assert.match(studyLessonAsk("Newton's laws"), /ONE idea|one idea/i);
  assert.match(studyLessonAsk("Newton's laws"), /(?:this|current) conversation/i);
  assert.match(studyLessonAsk("Newton's laws"), /Do not invent a specific YouTube/i);
  assert.match(studyQuizAsk("Newton's laws"), /current conversation/i);
  assert.match(studyPracticeAsk("Newton's laws"), /current conversation/i);
  assert.match(studyFlashcardAsk("Newton's laws"), /current conversation/i);
  assert.match(studyFlashcardAsk("Newton's laws"), /quantora-study-flashcard/i);
  assert.match(studyFlashcardAsk("Newton's laws"), /Do not use a Markdown table/i);
  assert.match(studyApplicationAsk("Newton's laws"), /current learning context/i);
  assert.match(studyRealWorldAsk("Newton's laws"), /real-world application/i);
  assert.match(studyWhereNextAsk("Newton's laws"), /three concise next moves/i);
  assert.match(studyPlanAsk("Newton's laws"), /context already known/i);
  assert.match(studyNotesAsk("Newton's laws"), /actually established/i);
});

test('learner-directed Study paths stay focused and appear as natural requests', () => {
  assert.equal(studyActionVisibleText('different', 'inertia'), 'Explain inertia a different way.');
  assert.equal(studyActionVisibleText('visual', 'inertia'), 'Show me inertia visually.');
  assert.equal(studyActionVisibleText('real-world', 'inertia'), 'Show me inertia in the real world.');
  assert.equal(studyActionVisibleText('where-next', 'inertia'), 'Help me choose where to go next after inertia.');
});

test('Study controls show a human learner request while model instructions stay private', () => {
  const detailed = studyLessonAsk("Newton's laws");
  const visible = studyActionVisibleText('lesson', "Newton's laws");
  assert.match(detailed, /Do not invent a specific YouTube/i);
  assert.equal(visible, "Explain Newton's laws like a real tutor.");
  assert.doesNotMatch(visible, /Do not|context-aware|wait for the learner|picture tag/i);
});

test('Study lesson guidance asks for natural tutoring and real turn-taking', () => {
  const ask = studyLessonAsk('inertia');
  assert.match(ask, /two or three natural paragraphs/i);
  assert.match(ask, /Do not use labels/i);
  assert.match(ask, /End on ONE short diagnostic or application question/i);
  assert.match(ask, /STOP there so the learner can answer/i);
  assert.doesNotMatch(ask, /End with one context-aware question/i);
});

test('Explain differently switches teaching modality instead of regenerating the same answer', () => {
  const ask = studyExplainDifferentlyAsk('inertia');
  assert.match(ask, /Do NOT repeat the same wording, structure, analogy, or worked example/i);
  assert.match(ask, /Switch modality deliberately/i);
  assert.match(ask, /analogy|picture|worked example/i);
  assert.match(ask, /STOP/i);
});

test('Show visually prefers a truthful teaching visual over decoration', () => {
  const ask = studyVisualExplainAsk('inertia');
  assert.match(ask, /visually/i);
  assert.match(ask, /subject-aware/i);
  assert.match(ask, /Never add a decorative image/i);
  assert.match(ask, /STOP after one question/i);
});

test('practice and quiz prompts require feedback tied to learner reasoning', () => {
  assert.match(studyPracticeAsk('inertia'), /specific part of my reasoning/i);
  assert.match(studyQuizAsk('inertia'), /specific feedback about my reasoning/i);
});
