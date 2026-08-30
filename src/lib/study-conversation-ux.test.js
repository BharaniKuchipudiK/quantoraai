import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the lesson never renders a second composer', () => {
  /*
   * This first replaced a vague "Your turn" banner with an embedded input, then
   * the input itself had to go. It was a plain field calling the same send path
   * as the composer at the bottom of the screen, with none of its capabilities
   * — no attachment, no voice, no enhance — and two inputs on one screen is an
   * ambiguity, not a convenience.
   */
  const markdown = read('src/components/StudyMarkdown.jsx');
  assert.doesNotMatch(markdown, /data-quantora-study-answer-affordance/);
  assert.doesNotMatch(markdown, /<input|<form/);
  assert.doesNotMatch(markdown, /data-quantora-study-your-turn|Your turn — tap or type/);
});

test('the question is anchored in the composer, and only when one was asked', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /studyAwaitsAnswer\(/);
  assert.match(studio, /awaitingStudyAnswer \? 'Write your answer to the question above/);
});

test('incorrect resolution offers repair choices without punitive red failure styling', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  assert.match(shell, /Good attempt — here is the key distinction/);
  assert.match(shell, />Another example</);
  assert.match(shell, />Useful reference</);
  assert.match(shell, /onRemediation\?\.\('retry'\)/);
  assert.doesNotMatch(shell, /#9f1239|#fb7185/);
});

test('Study affordances stay hard-gated at the education render boundary', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /studioDomain === 'education' && msg\.sender === 'ai'/);
  assert.match(studio, /studioDomain === 'education' \? \(/);
  assert.equal((studio.match(/<StudyTutorWorkspace/g) || []).length, 1);
  assert.equal((studio.match(/<StudyMarkdown/g) || []).length, 1);
});

test('Study model guidance forbids automatic repeats after a correct answer', () => {
  const directives = read('api/_lib/studio-domains.ts');
  const education = directives.slice(directives.indexOf('education:'), directives.indexOf('finance:'));
  assert.match(education, /answers a question correctly[\s\S]*Do not repeat it automatically/i);
});

test('Study explanations use the available width and keep the platform UI font at the message boundary', () => {
  const css = read('src/index.css');
  const studyCss = css.slice(css.indexOf('html[data-quantora-domain="education"] .app-shell--studio .markdown-prose'));
  assert.match(studyCss, /font-family: var\(--font-body\)/);
  assert.match(studyCss, /max-width: 68rem/);
  assert.doesNotMatch(studyCss.slice(0, 500), /max-width: 34rem|font-study-body/);
});

test('Study reading copy has a quiet book-like type voice without changing controls', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  assert.match(markdown, /STUDY_READING_FONT/);
  assert.match(markdown, /Charter/);
  assert.match(markdown, /Iowan Old Style/);
  assert.match(markdown, /data-quantora-study-reading-copy="true"/);
  assert.match(markdown, /fontFamily: STUDY_READING_FONT/);
});

test('Study responses carry subtle tutor illustration cues rather than a chatbot avatar', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  const nudge = read('src/components/StudyTutorNudge.jsx');
  assert.match(markdown, /<StudyTutorNudge/);
  assert.match(nudge, /data-quantora-study-nudge=\{kind\}/);
  for (const visual of ['wave', 'book', 'pencil', 'spark', 'magnify', 'idea']) {
    assert.match(nudge, new RegExp(`${visual}:`));
  }
  assert.doesNotMatch(nudge, /avatar|mascot/i);
});

test('Study removes robotic response labels without changing other domain renderers', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  const studio = read('src/components/AiStudio.jsx');
  assert.match(markdown, /polishStudyTutorText\(text\)/);
  assert.match(studio, /String\(tool\)\.startsWith\('study-'\)[\s\S]*visibleUserText: action\.visibleText/);
  assert.match(studio, /String\(tool\)\.startsWith\('travel-'\)[\s\S]*handleSendMessage\(action\.text\)/);
});

test('Study flashcards are an interactive hidden-answer deck, not a Front/Back table', () => {
  const deck = read('src/components/StudyFlashcards.jsx');
  const markdown = read('src/components/StudyMarkdown.jsx');
  assert.match(deck, /data-quantora-study-flashcard=\{revealed \? 'back' : 'front'\}/);
  assert.match(deck, /Tap when you have an answer in mind/);
  assert.match(deck, />Next <ArrowRight/);
  assert.match(markdown, /<StudyFlashcards/);
});

test('Study gives the learner compact next-path choices instead of dumping activities into the lesson', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  assert.match(shell, /data-quantora-study-next-choices="true"/);
  for (const label of ['Explain differently', 'Show visually', 'Real world', 'Mini practice', 'Quick sketch', 'Did you know?', 'Where next?']) {
    assert.match(shell, new RegExp(label.replace('?', '\\?')));
  }
});
