import assert from 'node:assert/strict';
import test from 'node:test';
import { deskCommitRegressesPreview, vfsIsRunnablePreview, looksTruncatedHtml } from './desk-commit-guard.js';

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

test('ALLOWS the first build (no prior working preview)', () => {
  assert.equal(deskCommitRegressesPreview({}, htmlVfs(COMPLETE_HTML)).reject, false);
  assert.equal(deskCommitRegressesPreview(htmlVfs(TRUNCATED_STUB), htmlVfs(COMPLETE_HTML)).reject, false);
  assert.equal(deskCommitRegressesPreview(htmlVfs(''), reactProjectVfs).reject, false);
});
