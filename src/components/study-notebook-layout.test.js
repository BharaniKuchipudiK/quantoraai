import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('./study-notebook.css', import.meta.url), 'utf8');

function rulesFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))]
    .map((match) => match[1])
    .join('\n');
}

test('Study Notebook keeps one navigation pane and one dominant writing pane on desktop', () => {
  assert.match(
    css,
    /\.study-h1-notebook__workspace\s*\{[^}]*grid-template-columns:\s*minmax\(280px, 320px\)\s+minmax\(0, 1fr\)/s,
  );
  assert.match(
    rulesFor('.study-h1-notebook__workspace'),
    /grid-template-rows:\s*minmax\(132px, 1fr\)\s+minmax\(220px, 2fr\)/,
    'the navigation rail should keep an approximately one-third/two-thirds split without percentage tracks',
  );
  assert.match(
    css,
    /\.study-h1-notebook__editor\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1 \/ span 2;/s,
  );
  assert.doesNotMatch(css, /grid-template-columns:\s*190px\s+280px\s+minmax\(0, 1fr\)/);
});

test('Notebook panel owns its width and expanded mode stays physically below the app header', () => {
  const notebookPanel = rulesFor('.study-h1-hub__panel.study-h1-hub__panel--notebook');
  const expandedPanel = rulesFor('.study-h1-hub__panel.study-h1-hub__panel--notebook-expanded');

  assert.match(notebookPanel, /width:\s*min\(1180px, calc\(100vw - 40px\)\)/);
  assert.match(notebookPanel, /padding:\s*0/);
  assert.match(expandedPanel, /width:\s*auto/);
  assert.match(expandedPanel, /padding:\s*0/);
  assert.match(
    expandedPanel,
    /inset:\s*max\(76px, calc\(env\(safe-area-inset-top\) \+ 68px\)\)/,
    'expanded Notebook must begin below the persistent workspace header instead of competing with it for pointer events',
  );
  assert.doesNotMatch(
    css,
    /\.ai-studio-shell:has\([^}]+z-index:\s*110|\.study-h1-hub:has\([^}]+z-index:\s*110/s,
    'Notebook must not escape stacking contexts by raising the whole Studio shell above global chrome',
  );
  assert.doesNotMatch(css, /^\.study-h1-hub__panel--notebook\s*\{/m);
  assert.doesNotMatch(css, /^\.study-h1-hub__panel--notebook-expanded\s*\{/m);
});

test('collapsed Notebook reserves launcher, header, and safe-area clearance', () => {
  const notebook = rulesFor('.study-h1-notebook');
  const panel = rulesFor('.study-h1-hub__panel.study-h1-hub__panel--notebook');

  assert.match(
    notebook,
    /height:\s*min\(720px, calc\(100dvh - 200px - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)\)/,
    'collapsed Notebook must leave room for the bottom hub stack and persistent header',
  );
  assert.match(
    notebook,
    /min-height:\s*min\(520px, calc\(100dvh - 200px - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)\)/,
    'short viewports must be allowed to shrink below the desktop 520px preference rather than overlap global chrome',
  );
  assert.match(
    panel,
    /max-height:\s*min\(820px, calc\(100dvh - 200px - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)\)/,
    'collapsed panel itself must respect the same reserved vertical budget',
  );
});

test('expanded Notebook derives its definite height from both effective safe-area edges', () => {
  const expandedPanel = rulesFor('.study-h1-hub__panel.study-h1-hub__panel--notebook-expanded');
  assert.match(
    expandedPanel,
    /height:\s*calc\(100dvh - max\(76px, calc\(env\(safe-area-inset-top\) \+ 68px\)\) - max\(18px, env\(safe-area-inset-bottom\)\)\)/,
    'expanded Notebook height must shrink when either vertical safe-area inset grows',
  );
});

test('Study Notebook gives learner writing a definite workspace track without clipping the editor', () => {
  assert.match(rulesFor('.study-h1-notebook'), /display:\s*grid/);
  assert.match(
    rulesFor('.study-h1-notebook'),
    /grid-template-rows:\s*auto\s+minmax\(0, 1fr\)/,
    'Notebook must own a definite header/workspace grid rather than delegate block sizing to nested flex content',
  );
  assert.match(
    rulesFor('.study-h1-hub__panel.study-h1-hub__panel--notebook-expanded'),
    /height:\s*calc\(100dvh - max\(76px, calc\(env\(safe-area-inset-top\) \+ 68px\)\) - max\(18px, env\(safe-area-inset-bottom\)\)\)/,
    'the fixed expanded panel must establish a definite viewport height below the workspace header',
  );
  assert.match(
    rulesFor('.study-h1-hub__panel--notebook-expanded .study-h1-notebook'),
    /height:\s*100%/,
    'the Notebook must inherit the expanded panel height so the writing canvas has a definite block size',
  );
  assert.match(rulesFor('.study-h1-notebook__workspace'), /height:\s*100%/);
  assert.doesNotMatch(
    rulesFor('.study-h1-notebook__workspace'),
    /flex:\s*1/,
    'the workspace must use its grid track instead of a second flex sizing chain',
  );
  assert.match(rulesFor('.study-h1-notebook__editor'), /overflow:\s*auto/);
  assert.match(rulesFor('.study-h1-notebook__editor textarea'), /flex:\s*1(?:;|\s)/);
  assert.match(rulesFor('.study-h1-notebook__editor textarea'), /min-height:\s*260px/);
  assert.match(rulesFor('.study-h1-notebook__editor-head > input'), /font-size:\s*1\.55rem/);
  assert.match(rulesFor('.study-h1-notebook__editor textarea'), /font-size:\s*0\.95rem/);
  assert.match(rulesFor('.study-h1-notebook__editor textarea'), /line-height:\s*1\.75/);
  assert.match(rulesFor('.study-h1-notebook__nav-item'), /font-size:\s*0\.77rem/);
});

test('mobile fixed sizing applies only to expanded Notebook and preserves the bottom safe area', () => {
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.study-h1-hub__panel\.study-h1-hub__panel--notebook-expanded\s*\{[^}]*inset:\s*max\(70px, calc\(env\(safe-area-inset-top\) \+ 62px\)\) max\(10px, env\(safe-area-inset-right\)\) max\(10px, env\(safe-area-inset-bottom\)\) max\(10px, env\(safe-area-inset-left\)\)/s,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?height:\s*calc\(100dvh - max\(70px, calc\(env\(safe-area-inset-top\) \+ 62px\)\) - max\(10px, env\(safe-area-inset-bottom\)\)\)/s,
  );
  assert.doesNotMatch(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.study-h1-hub__panel\.study-h1-hub__panel--notebook,\s*\.study-h1-hub__panel\.study-h1-hub__panel--notebook-expanded\s*\{/s,
    'collapsed mobile Notebook must stay in the bottom hub flow rather than receive fixed expanded geometry',
  );
});

test('Study Notebook collapses to a single-column flow on narrow screens', () => {
  assert.match(
    css,
    /@media \(max-width: 700px\)[\s\S]*?\.study-h1-notebook__workspace\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
});
