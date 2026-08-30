import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Study renders reinforcement from the graded server outcome only', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  const cue = read('src/components/StudyReinforcementCue.jsx');
  assert.match(shell, /<StudyReinforcementCue outcome=\{assessment\.result\}/);
  assert.match(cue, /studyHumanReinforcement\(outcome\)/);
  assert.match(cue, /data-quantora-study-reinforcement=\{cue\.kind\}/);
  assert.match(cue, /aria-live="polite"/);
});

test('semantic reinforcement motion is bounded, monochrome, and reduced-motion safe', () => {
  const cue = read('src/components/StudyReinforcementCue.jsx');
  const styles = read('src/styles/quantora-monochrome.css');
  for (const kind of ['repair', 'progress', 'mastery']) {
    assert.match(styles, new RegExp(`q-study-${kind}`));
  }
  assert.doesNotMatch(styles, /q-study-(?:repair|progress|mastery)[\s\S]{0,160}\binfinite\b/i);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\[data-quantora-motion\][\s\S]*animation: none !important/);
  assert.doesNotMatch(cue, /confetti|shake|opacity/i);
});

test('ordinary correct answers use neutral copy instead of generic repetitive praise', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  assert.match(shell, /Answer verified\./);
  assert.doesNotMatch(shell, /Exactly — that fits|Great job|Amazing|Brilliant/);
});
