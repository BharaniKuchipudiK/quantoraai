import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compilePreviewVfs, ensureReactNamespaceBinding } from './preview-compiler.js';

// P0 release guard: this test exercises the exact self-hosted compiler used by Studio.
const calculatorVfs = {
  'package.json': { content: JSON.stringify({ dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'lucide-react': '^0.546.0' } }) },
  'src/main.jsx': {
    content: "import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; import './index.css'; createRoot(document.getElementById('root')).render(<App />);",
  },
  'src/App.jsx': {
    content: "import React,{useState} from 'react'; import { Delete } from 'lucide-react'; import './App.css'; export default function App(){const [value,setValue]=useState('0');return <main className='calculator'><output data-testid='calculator-display'>{value}</output><button data-testid='calculator-one' onClick={()=>setValue('1')}>1</button><Delete /></main>}",
  },
  'src/index.css': { content: 'body{margin:0;background:#fff}' },
  'src/App.css': { content: '.calculator{display:grid;gap:8px}' },
};

test('self-hosted preview compiler bundles React, package imports and local CSS without external runtime imports', async () => {
  const result = await compilePreviewVfs(calculatorVfs);
  assert.equal(result.entry, 'src/main.jsx');
  assert.ok(result.javascriptBytes > 0);
  assert.ok(result.cssBytes > 0);
  assert.match(result.html, /calculator-display/);
  assert.match(result.html, /calculator-one/);
  assert.match(result.html, /display:grid/);
  assert.doesNotMatch(result.html, /codesandbox/i);
  assert.doesNotMatch(result.html, /cdn\.jsdelivr|unpkg\.com|esm\.sh/i);
  assert.match(result.html, /rendered no content/);
});

test('generated StrictMode entry gets a preview-only React binding without changing Hira Silks files', async () => {
  const hiraSilksVfs = {
    'package.json': { content: JSON.stringify({ dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' } }) },
    'src/main.jsx': {
      content: "import { createRoot } from 'react-dom/client'; import App from './App.jsx'; import './index.css'; createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);",
    },
    'src/App.jsx': {
      content: "export default function App(){return <main><h1>Hira Silks</h1><p>Kanjivaram, Uppada and Gadwal sarees</p></main>}",
    },
    'src/index.css': { content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;\nbody{margin:0}' },
  };
  const before = structuredClone(hiraSilksVfs);
  const normalized = ensureReactNamespaceBinding(hiraSilksVfs['src/main.jsx'].content, 'src/main.jsx');
  assert.match(normalized, /^import React from 'react';/);
  const result = await compilePreviewVfs(hiraSilksVfs);
  assert.match(result.html, /Hira Silks/);
  assert.deepEqual(hiraSilksVfs, before, 'preview compatibility must not rewrite generated content');
});

test('the compiler bakes the correlation id and live-page probe into the iframe', async () => {
  const result = await compilePreviewVfs(calculatorVfs, { correlationId: 'browser-desk-probe-1' });
  assert.equal(result.correlationId, 'browser-desk-probe-1');
  assert.match(result.html, /browser-desk-probe-1/);
  assert.match(result.html, /hasCalculatorDisplay/);
  assert.match(result.html, /catalogCount/);
  assert.match(result.html, /bagIncremented/);
  const dropped = await compilePreviewVfs(calculatorVfs);
  assert.equal(dropped.correlationId, null);
  assert.match(dropped.html, /__quantoraCorrelationId=null/);
});

test('Vercel traces the browser packages resolved dynamically by the deployed compiler', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const includeFiles = config.functions?.['api/preview-compile.js']?.includeFiles || '';
  for (const dependency of ['react', 'react-dom', 'scheduler', 'lucide-react']) {
    assert.match(includeFiles, new RegExp(`(?:^|[,{}])${dependency.replace('-', '\\-')}(?:[,}/]|$)`));
  }
});

test('preview compiler fails closed for unsupported server-side dependencies', async () => {
  await assert.rejects(
    () => compilePreviewVfs({ 'src/main.jsx': { content: "import fs from 'node:fs'; console.log(fs)" } }),
    /Unsupported preview dependency: node:fs/,
  );
});

test('preview compiler fails clearly for missing local modules', async () => {
  await assert.rejects(
    () => compilePreviewVfs({ 'src/main.jsx': { content: "import App from './Missing.jsx'; console.log(App)" } }),
    /Missing local preview module: \.\/Missing\.jsx/,
  );
});

test('preview compiler rejects storage APIs unavailable to an opaque-origin iframe', async () => {
  await assert.rejects(
    () => compilePreviewVfs({ 'src/main.jsx': { content: "localStorage.getItem('theme')" } }),
    /cannot use localStorage or sessionStorage/i,
  );
});
