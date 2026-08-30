import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const migrated = [
  'src/styles/quantora-monochrome.css',
  'src/components/StudyFlashcards.jsx',
  'src/components/StudyTutorNudge.jsx',
];

const allowedHex = new Set(['#000', '#000000', '#fff', '#ffffff']);

function assertPureMonochromeSource(relative) {
  const source = read(relative);
  assert.doesNotMatch(source, /(?:linear|radial|conic)-gradient\s*\(/i, `${relative} must not use gradients`);
  assert.doesNotMatch(source, /rgba?\s*\(/i, `${relative} must not manufacture shades with rgb/rgba`);
  assert.doesNotMatch(source, /hsla?\s*\(/i, `${relative} must not manufacture shades with hsl/hsla`);

  for (const color of source.match(/#[0-9a-f]{3,8}\b/gi) || []) {
    assert.ok(allowedHex.has(color.toLowerCase()), `${relative} contains non-monochrome color ${color}`);
  }
}

test('the platform loads the Quantora monochrome token foundation', () => {
  const main = read('src/main.jsx');
  const tokens = read('src/styles/quantora-monochrome.css');

  assert.match(main, /quantora-monochrome\.css/);
  assert.match(tokens, /--q-paper:\s*#ffffff/);
  assert.match(tokens, /--q-ink:\s*#000000/);
  assert.match(tokens, /\[data-theme="dark"\][\s\S]*--q-paper:\s*#000000/);
  assert.match(tokens, /\[data-theme="dark"\][\s\S]*--q-ink:\s*#ffffff/);
});

test('migrated monochrome sources contain no shades, gradients, or alpha colors', () => {
  for (const relative of migrated) assertPureMonochromeSource(relative);
});

test('migrated Study controls do not use opacity to fake disabled or secondary states', () => {
  for (const relative of [
    'src/components/StudyFlashcards.jsx',
    'src/components/StudyTutorNudge.jsx',
  ]) {
    const source = read(relative);
    assert.doesNotMatch(source, /\bopacity\s*:/i, `${relative} must not use CSS opacity`);
    assert.doesNotMatch(source, /\bopacity\s*=/i, `${relative} must not use SVG opacity`);
  }
});

test('flashcards express reveal, disabled, and focus states without a third color', () => {
  const flashcards = read('src/components/StudyFlashcards.jsx');
  const inheritedStyles = read('src/index.css');
  const faceAnimation = inheritedStyles.match(/@keyframes study-flashcard-face\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(flashcards, /background:\s*revealed \? 'var\(--q-inverse-paper\)' : 'var\(--q-paper\)'/);
  assert.match(flashcards, /color:\s*revealed \? 'var\(--q-inverse-ink\)' : 'var\(--q-ink\)'/);
  assert.match(flashcards, /borderStyle:\s*disabled \? 'dashed' : 'solid'/);
  assert.match(flashcards, /className="q-mono-control"/);
  assert.doesNotMatch(flashcards, /boxShadow|textShadow/);
  assert.ok(faceAnimation, 'the inherited flashcard animation must remain covered by this contract');
  assert.doesNotMatch(faceAnimation, /\bopacity\s*:/i, 'the inherited flashcard animation must not manufacture gray');
});

test('tutor nudges keep the full visual vocabulary in black and white', () => {
  const nudge = read('src/components/StudyTutorNudge.jsx');
  for (const visual of ['wave', 'book', 'pencil', 'spark', 'magnify', 'idea']) {
    assert.match(nudge, new RegExp(`${visual}:`));
  }
  assert.match(nudge, /const ink = 'var\(--q-ink\)'/);
  assert.match(nudge, /const paper = 'var\(--q-paper\)'/);
  assert.doesNotMatch(nudge, /avatar|mascot/i);
});
