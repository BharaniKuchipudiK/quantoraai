import assert from 'node:assert/strict';
import test from 'node:test';
import { compilePreviewVfs } from './preview-compiler.js';

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
