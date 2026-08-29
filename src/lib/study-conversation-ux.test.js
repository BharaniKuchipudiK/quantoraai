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
  // The prompt tells the tutor to END with "Write your attempt", so matching
  // that phrase put an answer field under lessons that had asked nothing.
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
