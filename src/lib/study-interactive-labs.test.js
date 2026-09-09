import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  STUDY_LAB_KINDS,
  decorateStudyMessage,
  splitStudySegments,
  studyPicturePromptHint,
} from './study-pictures.js';

const visualLabSource = fs.readFileSync(new URL('../components/StudyVisualLab.jsx', import.meta.url), 'utf8');
const linearLabSource = fs.readFileSync(new URL('../components/StudyLinearFunctionLab.jsx', import.meta.url), 'utf8');

test('linear-function is a governed Study lab kind', () => {
  assert.ok(STUDY_LAB_KINDS.includes('linear-function'));
  const parts = splitStudySegments(
    '<quantora-study-lab kind="linear-function" />\nCompare slope and y-intercept.',
    'Linear functions: slope-intercept form y = mx + b',
  );
  assert.equal(parts[0].type, 'lab');
  assert.equal(parts[0].kind, 'linear-function');
});

test('linear-function lab fails closed outside a matching mathematics lesson', () => {
  const pythagoras = decorateStudyMessage(
    '<quantora-study-lab kind="linear-function" />\nFind the hypotenuse.',
    'Pythagoras theorem',
  );
  assert.doesNotMatch(pythagoras, /quantora-study-lab/);

  const mechanics = decorateStudyMessage(
    '<quantora-study-lab kind="linear-function" />\nPush the crate.',
    "Newton's laws of motion",
  );
  assert.doesNotMatch(mechanics, /quantora-study-lab/);
});

test('mechanics labs remain scoped to mechanics after the math lab is added', () => {
  const leakedNewton = decorateStudyMessage(
    '<quantora-study-lab kind="newton" />\nChange the slope.',
    'Linear function y = mx + b',
  );
  assert.doesNotMatch(leakedNewton, /quantora-study-lab/);

  const realNewton = decorateStudyMessage(
    '<quantora-study-lab kind="fbd" />\nPush the crate.',
    "Newton's laws of motion",
  );
  assert.match(realNewton, /kind="fbd"/);
});

test('unknown lab kinds are stripped instead of falling back to Newton', () => {
  const unknown = decorateStudyMessage(
    '<quantora-study-lab kind="mystery-lab" />\nNewton second law.',
    "Newton's laws of motion",
  );
  assert.doesNotMatch(unknown, /quantora-study-lab/);
});

test('the linear-function experience is prediction-first and stays local', () => {
  assert.match(linearLabSource, /1 · Predict/);
  assert.match(linearLabSource, /disabled=!\{?prediction\}?|disabled=\{!prediction\}/);
  assert.match(linearLabSource, /2 · Manipulate/);
  assert.match(linearLabSource, /3 · Run/);
  assert.match(linearLabSource, /4 · Observe/);
  assert.match(linearLabSource, /5 · Explain/);
  assert.match(linearLabSource, /data-quantora-study-interactive-lab="linear-function"/);
  assert.match(linearLabSource, /role="img"/);
  assert.match(linearLabSource, /aria-live="polite"/);
  assert.doesNotMatch(linearLabSource, /mastery|persist|supabase|fetch\(|learning[-_ ]?signal/i);
});

test('the math lab is lazy-loaded behind the existing Study workspace', () => {
  assert.match(visualLabSource, /React\.lazy\(\(\) => import\('\.\/StudyLinearFunctionLab\.jsx'\)\)/);
  assert.match(visualLabSource, /kind === 'linear-function'/);
  assert.doesNotMatch(visualLabSource, /data-quantora-study-workspace="linear-function"/);
});

test('the tutor prompt knows the exact governed linear-function lab tag', () => {
  const hint = studyPicturePromptHint('linear functions');
  assert.match(hint, /<quantora-study-lab kind="linear-function" \/>/);
  assert.match(hint, /Never use that lab for another mathematics topic/);
});
