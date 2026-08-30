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
  'src/components/FinanceBoard.jsx',
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

/*
 * The Finance board is the first non-Study surface on the tokens. It used to
 * take isLight, textColor and subtextColor from its parent and pick a teal
 * accent from them. A component that asks what colour to be is how a stray
 * shade re-enters a monochrome system, so the props are gone and the tokens
 * decide.
 */
test('the Finance board takes no inherited colour props', () => {
  const board = read('src/components/FinanceBoard.jsx');
  const signature = board.match(/export default function FinanceBoard\(\{([^}]*)\}/)?.[1] || '';
  assert.ok(signature, 'the board signature must be readable');
  for (const prop of ['isLight', 'textColor', 'subtextColor']) {
    assert.doesNotMatch(signature, new RegExp(`\\b${prop}\\b`), `${prop} must not be a prop`);
  }

  // And the parent must stop handing them over.
  const studio = read('src/components/AiStudio.jsx');
  const usage = studio.match(/<FinanceBoard[\s\S]*?\/>/)?.[0] || '';
  assert.ok(usage, 'the board must still be rendered');
  assert.doesNotMatch(usage, /isLight|textColor|subtextColor/);
});

test('the Finance board builds hierarchy from type and rules, not a third colour', () => {
  const board = read('src/components/FinanceBoard.jsx');
  assert.match(board, /background: 'var\(--q-paper\)'/);
  assert.match(board, /color: 'var\(--q-ink\)'/);
  assert.match(board, /border: '1px solid var\(--q-border\)'/);
  assert.match(board, /borderTop: '1px solid var\(--q-border\)'/, 'the chip row is separated by a rule, not a tint');
  assert.doesNotMatch(board, /\bopacity\s*[:=]/i, 'no faked shades');
  assert.doesNotMatch(board, /boxShadow|textShadow/, 'no glow standing in for an accent');
  assert.match(board, /className="q-mono-control q-mono-chip"/, 'chips take the shared focus and inversion primitives');
});

/* Inversion is the system's highlight — the one emphasis available without a third value. */
test('the chip primitive highlights by inverting paper and ink', () => {
  const tokens = read('src/styles/quantora-monochrome.css');
  const rule = tokens.match(/\.q-mono-chip:hover,[\s\S]*?\{([\s\S]*?)\}/)?.[1] || '';
  assert.ok(rule, 'the chip primitive must exist');
  assert.match(rule, /background:\s*var\(--q-inverse-paper\)/);
  assert.match(rule, /color:\s*var\(--q-inverse-ink\)/);
});
