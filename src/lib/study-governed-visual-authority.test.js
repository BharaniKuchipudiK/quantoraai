import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { splitStudySegments } from './study-pictures.js';

const markdownSource = fs.readFileSync(new URL('../components/StudyMarkdown.jsx', import.meta.url), 'utf8');
const labSource = fs.readFileSync(new URL('../components/StudyVisualLab.jsx', import.meta.url), 'utf8');

test('StudyMarkdown does not manufacture subject pictures from generated prose', () => {
  assert.doesNotMatch(markdownSource, /ensureStudyTeachingVisual/);
  assert.match(markdownSource, /Representation authority is server-owned/);
});

test('Newton third-law lab tag survives only inside a Mechanics lesson', () => {
  const mechanics = splitStudySegments(
    '<quantora-study-lab kind="newton-third-law" />\nEqual and opposite forces act at the same instant.',
    "Newton's third law of motion",
  );
  assert.equal(mechanics[0]?.type, 'lab');
  assert.equal(mechanics[0]?.kind, 'newton-third-law');

  const algebra = splitStudySegments(
    '<quantora-study-lab kind="newton-third-law" />\nSolve x + 3 = 7.',
    'What is Algebra?',
  );
  assert.equal(algebra.some((segment) => segment.type === 'lab'), false);
});

test('Newton lab exposes a native third-law animation with reduced-motion handling', () => {
  assert.match(labSource, /data-quantora-study-animation="newton-third-law"/);
  assert.match(labSource, /Play push-apart animation/);
  assert.match(labSource, /prefers-reduced-motion: reduce/);
  assert.match(labSource, /Show final positions/);
});
