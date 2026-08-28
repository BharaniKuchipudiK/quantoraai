import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deskCanStart,
  deskCommitRegressesPreview,
  describeMissingImports,
  findMissingLocalImports,
  looksTruncatedHtml,
  vfsIsRunnablePreview,
} from './desk-commit-guard.js';

const COMPLETE_HTML = `<!DOCTYPE html><html lang="en"><head><title>Ember & Oak</title></head>
<body><header><h1>Ember & Oak</h1></header>
<main class="products">
${Array.from({ length: 12 }, (_, i) => `<div class="product-card"><img src="/api/preview-image?u=x${i}"><h3>Coffee ${i}</h3><button>Add to Cart</button></div>`).join('\n')}
</main><footer>© Ember & Oak</footer></body></html>`;

const htmlVfs = (html) => ({ 'index.html': { content: html, language: 'html' } });

// A React/Vite project runtime.
const reactProjectVfs = {
  'package.json': { content: JSON.stringify({ dependencies: { react: '^19' } }), language: 'json' },
  'src/main.jsx': { content: "import { createRoot } from 'react-dom/client'; createRoot(document.getElementById('root')).render(<App/>);", language: 'jsx' },
  'src/App.jsx': { content: 'export default function App(){ return <div className="app"><h1>Coffee</h1></div>; }', language: 'jsx' },
};

// A concise inline React entry (the P2#4 case).
const smallReactVfs = { 'App.jsx': { content: 'export default () => <div className="hi">Hello Coffee</div>;', language: 'jsx' } };

const TRUNCATED_STUB = '">\n<!DOCTYPE html>\n<html lang="en">\n<head>';

test('runnable detection covers HTML, React project, and inline JSX', () => {
  assert.equal(vfsIsRunnablePreview(htmlVfs(COMPLETE_HTML)), true);
  assert.equal(vfsIsRunnablePreview(reactProjectVfs), true);
  assert.equal(vfsIsRunnablePreview(smallReactVfs), true);
  assert.equal(vfsIsRunnablePreview(htmlVfs(TRUNCATED_STUB)), false);
  assert.equal(vfsIsRunnablePreview(htmlVfs('')), false);
  assert.equal(vfsIsRunnablePreview({}), false);
});

test('truncation detection', () => {
  assert.equal(looksTruncatedHtml('<!DOCTYPE html><html><head><title>x</title>'), true);
  assert.equal(looksTruncatedHtml(COMPLETE_HTML), false);
});

test('rejects overwriting a working HTML page with a truncated stub (the real regression)', () => {
  const { reject, reason } = deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), htmlVfs(TRUNCATED_STUB));
  assert.equal(reject, true);
  assert.equal(reason, 'incoming-entry-truncated');
});

test('rejects overwriting a working page with empty or non-runnable output', () => {
  assert.equal(deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), htmlVfs('')).reject, true);
  assert.equal(deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), {}).reject, true);
  assert.equal(deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), htmlVfs('sorry, I could not finish that')).reject, true);
});

// P1#1: React/Vite previews are protected too.
test('PROTECTS a working React/Vite project from a broken overwrite', () => {
  assert.equal(deskCommitRegressesPreview(reactProjectVfs, htmlVfs(TRUNCATED_STUB)).reject, true);
  assert.equal(deskCommitRegressesPreview(reactProjectVfs, htmlVfs('')).reject, true);
});

// P2#4: a concise runnable React rewrite is allowed, not rejected for being short.
test('ALLOWS a legitimate HTML→React rewrite, even a tiny one', () => {
  assert.equal(deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), smallReactVfs).reject, false);
  assert.equal(deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), reactProjectVfs).reject, false);
});

test('ALLOWS a legitimate full rewrite and a legit smaller-but-complete page', () => {
  const rewritten = COMPLETE_HTML.replace('Ember & Oak', 'Ember & Oak Coffee Co');
  assert.equal(deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), htmlVfs(rewritten)).reject, false);
  const smaller = '<!DOCTYPE html><html><head><title>Ember</title></head><body><main><h1>Ember & Oak</h1><p>Cozy coffee.</p></main></body></html>';
  assert.equal(deskCommitRegressesPreview(htmlVfs(COMPLETE_HTML), htmlVfs(smaller)).reject, false);
});

// P1 (round 2): a React project whose entry component is truncated is NOT runnable.
const truncatedReactProjectVfs = {
  'package.json': { content: JSON.stringify({ dependencies: { react: '^19' } }), language: 'json' },
  'src/main.jsx': { content: "import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App/>);", language: 'jsx' },
  'src/App.jsx': { content: 'export default function App(){ return <div><h1>Cof', language: 'jsx' }, // dangling fence
};

test('a React project with a truncated entry component is NOT runnable', () => {
  assert.equal(vfsIsRunnablePreview(truncatedReactProjectVfs), false);
  const emptyApp = { ...truncatedReactProjectVfs, 'src/App.jsx': { content: '', language: 'jsx' } };
  assert.equal(vfsIsRunnablePreview(emptyApp), false);
});

test('rejects overwriting a working React project with a truncated React project', () => {
  const { reject } = deskCommitRegressesPreview(reactProjectVfs, truncatedReactProjectVfs);
  assert.equal(reject, true);
});

test('ALLOWS the first build (no prior working preview)', () => {
  assert.equal(deskCommitRegressesPreview({}, htmlVfs(COMPLETE_HTML)).reject, false);
  assert.equal(deskCommitRegressesPreview(htmlVfs(TRUNCATED_STUB), htmlVfs(COMPLETE_HTML)).reject, false);
  assert.equal(deskCommitRegressesPreview(htmlVfs(''), reactProjectVfs).reject, false);
});

/*
 * THE DESK THAT COULD NOT START, REPORTED AS PROVED.
 *
 * A scheduling board came back as three files: App.jsx and main.jsx complete,
 * and a Scheduler.jsx cut off after two import lines. JobPanel was never
 * written. Preview said "Missing local preview module: ./App"; the chat said
 * "the model hit the 175s limit, but Preview is already proved on the desk."
 *
 * Whether a page RENDERS needs a browser. Whether every module it imports was
 * written does not — it is a fact about files already in hand, and the cheap
 * half of the check was simply never done.
 */
const TRUNCATED_DESK = {
  'src/App.jsx': { content: "import React from 'react';\nimport Scheduler from './Scheduler';\nexport default function App(){ return <Scheduler/>; }" },
  'src/main.jsx': { content: "import React from 'react';\nimport App from './App';\nimport './styles.css';" },
  'src/Scheduler.jsx': { content: "import React, { useState } from 'react';\nimport JobPanel from './JobPanel';" },
};

test('a module that was never written is found', () => {
  const missing = findMissingLocalImports(TRUNCATED_DESK);
  const specs = missing.map((m) => m.spec).sort();
  assert.deepEqual(specs, ['./JobPanel', './styles.css']);
  assert.equal(deskCanStart(TRUNCATED_DESK), false, 'this desk cannot be called proved');
});

test('the report names the file and the import, not just a failure', () => {
  const note = describeMissingImports(findMissingLocalImports(TRUNCATED_DESK));
  assert.match(note, /`\.\/JobPanel` \(imported by src\/Scheduler\.jsx\)/);
  assert.match(note, /ran out before finishing/);
  assert.equal(describeMissingImports([]), '', 'a complete desk says nothing');
});

test('a complete project starts', () => {
  const vfs = {
    'src/App.jsx': { content: "import Scheduler from './Scheduler';\nexport default function App(){ return <Scheduler/>; }" },
    'src/Scheduler.jsx': { content: "export default function Scheduler(){ return <div/>; }" },
  };
  assert.deepEqual(findMissingLocalImports(vfs), []);
  assert.equal(deskCanStart(vfs), true);
});

test('extensions and index files resolve like a bundler', () => {
  const vfs = {
    'src/App.jsx': { content: "import a from './a';\nimport b from './b.jsx';\nimport c from './c/index.js';\nimport css from './s.css';" },
    'src/a.js': { content: 'export default 1;' },
    'src/b.jsx': { content: 'export default 2;' },
    'src/c/index.js': { content: 'export default 3;' },
    'src/s.css': { content: 'body{}' },
  };
  assert.deepEqual(findMissingLocalImports(vfs), []);
});

test('package imports are not local files and are never flagged', () => {
  const vfs = {
    'src/App.jsx': { content: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nexport default function App(){ return null; }" },
  };
  assert.deepEqual(findMissingLocalImports(vfs), [], 'react is resolved by the compiler, not the desk');
});

test('a plain HTML desk has no module graph to check', () => {
  assert.equal(deskCanStart({ 'index.html': { content: '<!DOCTYPE html><html><body><h1>Hi</h1></body></html>' } }), true);
  assert.equal(deskCanStart({}), true, 'an empty desk is not a broken one');
});
