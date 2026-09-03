import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * The signed-in platform matches the marketing homepage: flat white or
 * near-black surfaces, hairline borders, and no decorative colour — no CSS
 * gradients and no ambient "aurora" light effect behind the app.
 *
 * This was a deliberate cleanup (the aurora component was deleted, every
 * gradient in the shared chrome was flattened), and gradients have a way of
 * returning one button at a time. The contract is precise on purpose: it fires
 * only on a CSS gradient FUNCTION in a chrome source, or on the aurora
 * selectors coming back — both unambiguous. It does not police plain colours,
 * so a flat accent or a red destructive action never trips it.
 *
 * Deliberately outside the contract:
 * - SVG <linearGradient> elements (brand logo marks, e.g. the Gemini pill);
 * - the .studio-gloss-row__radio dot, which uses radial-gradient() to draw a
 *   solid circle, not a colour blend — index.css is checked for linear/conic
 *   gradients only for that reason.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const chromeSources = [
  'src/App.jsx',
  'src/components/Header.jsx',
  'src/components/Footer.jsx',
  'src/components/WelcomeHub.jsx',
  'src/components/AiStudio.jsx',
  'src/components/FeedbackWidget.jsx',
  'src/styles/feedback-widget.css',
];

test('post-auth chrome contains no CSS gradient functions', () => {
  for (const relative of chromeSources) {
    const source = read(relative);
    assert.doesNotMatch(
      source,
      /(?:linear|radial|conic)-gradient\s*\(/i,
      `${relative} must stay flat — no CSS gradients in the signed-in chrome`,
    );
  }
});

test('the ambient aurora light effect stays deleted', () => {
  assert.ok(
    !fs.existsSync(path.join(root, 'src/components/AuroraBackground.jsx')),
    'AuroraBackground.jsx must not exist — the app renders on flat surfaces',
  );
  const app = read('src/App.jsx');
  assert.doesNotMatch(app, /AuroraBackground/, 'App must not render an ambient background');

  const css = read('src/index.css');
  assert.doesNotMatch(css, /\.aurora-/, 'the aurora styles must not survive in index.css');
  assert.doesNotMatch(
    css,
    /(?:linear|conic)-gradient\s*\(/i,
    'index.css must not reintroduce linear/conic gradients',
  );
});

test('the app shell uses the flat homepage surfaces in both themes', () => {
  const app = read('src/App.jsx');
  // The shell is one flat surface per theme — the same values the marketing
  // homepage paints — with no per-tab special case.
  assert.match(app, /background: isLight \? '#ffffff' : '#0a0a0a',/);
  assert.doesNotMatch(app, /#070913/, 'the old navy shell colour must not come back');
});
