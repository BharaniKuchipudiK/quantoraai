import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the vague Your turn banner is replaced by an embedded answer affordance', () => {
  const markdown = read('src/components/StudyMarkdown.jsx');
  assert.match(markdown, /data-quantora-study-answer-affordance="embedded"/);
  assert.match(markdown, /aria-label="Answer the tutor question"/);
  assert.doesNotMatch(markdown, /data-quantora-study-your-turn|Your turn — tap or type/);
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
