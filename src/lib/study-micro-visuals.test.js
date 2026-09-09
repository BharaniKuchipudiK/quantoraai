import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  studyBeforeAfterSpec,
  studyFractionSpec,
  studyMicroVisualKind,
  studyMicroVisualPromptHint,
} from './study-micro-visuals.js';
import { studyPictureFitsTopic } from './study-concept-visual.js';

const markdownSource = fs.readFileSync(new URL('../components/StudyMarkdown.jsx', import.meta.url), 'utf8');
const rendererSource = fs.readFileSync(new URL('../components/StudyMicroVisual.jsx', import.meta.url), 'utf8');
const resourceSource = fs.readFileSync(new URL('./study-learning-resources.js', import.meta.url), 'utf8');

test('fraction micro visual parses one explicit fraction and equivalent pairs', () => {
  assert.deepEqual(studyFractionSpec('Fraction model: 3/4'), {
    left: { numerator: 3, denominator: 4 },
    right: null,
  });
  assert.deepEqual(studyFractionSpec('Equivalent fractions 2/3 and 4/6'), {
    left: { numerator: 2, denominator: 3 },
    right: { numerator: 4, denominator: 6 },
  });
  assert.deepEqual(studyFractionSpec('Proportion model: 2/3 = 4/6'), {
    left: { numerator: 2, denominator: 3 },
    right: { numerator: 4, denominator: 6 },
  });
});

test('fraction micro visual refuses false, ambiguous, improper, or oversized models', () => {
  assert.equal(studyFractionSpec('Proportion model: 2/3 = 4/7'), null);
  assert.equal(studyFractionSpec('Compare fractions 2/3 and 4/7'), null);
  assert.equal(studyFractionSpec('Fraction model: 5/4'), null);
  assert.equal(studyFractionSpec('Fraction model: 3/14'), null);
  assert.equal(studyFractionSpec('The probability is 3/4'), null);
});

test('before-after primitive requires one explicit state transition', () => {
  assert.deepEqual(studyBeforeAfterSpec('Before/after: ice -> liquid water'), {
    before: 'ice',
    after: 'liquid water',
  });
  assert.equal(studyBeforeAfterSpec('Process: ice -> liquid water'), null);
  assert.equal(studyBeforeAfterSpec('Before/after: same -> same'), null);
  assert.equal(studyMicroVisualKind('Before/after: seed -> seedling'), 'before-after');
});

test('micro visuals stay inside the governed Study picture authority', () => {
  assert.equal(studyMicroVisualKind('Fraction model: 3/4'), 'fraction-model');
  assert.equal(studyPictureFitsTopic('Fraction model: 3/4', 'Equivalent fractions'), true);
  assert.equal(studyPictureFitsTopic('Before/after: seed -> seedling', 'Plant growth'), true);
  assert.match(markdownSource, /studyPictureFitsTopic\(segment\.caption, activeTopic\)/);
  assert.match(markdownSource, /studyMicroVisualKind\(segment\.caption\)/);
  assert.match(markdownSource, /<StudyMicroVisual/);
});

test('micro visual renderer is inline, accessible, and does not create another workspace', () => {
  assert.match(rendererSource, /data-quantora-study-micro-visual=\{kind\}/);
  assert.match(rendererSource, /role="img"/);
  assert.match(rendererSource, /aria-label=\{label\}/);
  assert.doesNotMatch(rendererSource, /data-quantora-study-workspace/);
});

test('tutor prompt advertises only narrow deterministic micro visual grammar', () => {
  const hint = studyMicroVisualPromptHint();
  assert.match(hint, /Fraction model: 3\/4/);
  assert.match(hint, /Proportion model: 2\/3 = 4\/6/);
  assert.match(hint, /Before\/after: starting state -> resulting state/);
  assert.match(resourceSource, /studyMicroVisualPromptHint\(\)/);
});
