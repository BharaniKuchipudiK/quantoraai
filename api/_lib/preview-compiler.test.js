import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compilePreviewVfs, createLegacyReactDomApi, ensureReactNamespaceBinding } from './preview-compiler.js';

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

test('React namespace shim does not duplicate an existing local runtime binding', () => {
  const source = "const React = globalThis.React;\nconsole.log(React.StrictMode);";
  assert.equal(ensureReactNamespaceBinding(source, 'src/main.jsx'), source);
});

test('React namespace shim recognizes TypeScript import assignment', () => {
  const source = "import React = require('react');\nconsole.log(React.StrictMode);";
  assert.equal(ensureReactNamespaceBinding(source, 'src/main.tsx'), source);
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

/*
 * 2026-09-05, production, run 33998084340: with Gemini refusing, the website
 * transaction was built by a fallback engine that wrote the React 17 mount —
 * `import ReactDOM from 'react-dom'; ReactDOM.render(<App />, root)`. The
 * artifact contract accepts that as a mount (build-artifact-contract.ts) and
 * the desk sees "its own mount" and injects none (project-runtime-preview.js),
 * so the project reached the iframe intact — where React 19 has no
 * ReactDOM.render, and the preview died with
 * "Uncaught TypeError: re.default.render is not a function". Two surfaces
 * agreed the project was runnable; the runtime disagreed. The compiler now
 * resolves a bare `react-dom` import to a shim that carries the legacy API on
 * top of react-dom/client, so the authored files stay untouched and still run.
 */
const legacyMountVfs = {
  'package.json': { content: JSON.stringify({ dependencies: { react: '^17.0.2', 'react-dom': '^17.0.2' } }) },
  'src/main.jsx': {
    content: "import React from 'react'; import ReactDOM from 'react-dom'; import App from './App.jsx'; ReactDOM.render(<App />, document.getElementById('root'));",
  },
  'src/App.jsx': { content: "export default function App(){return <main><h1>Sunrise Bakery</h1></main>}" },
};

test('a React 17 mount (ReactDOM.render) is carried onto the React 19 runtime by the legacy react-dom shim', async () => {
  const legacy = await compilePreviewVfs(legacyMountVfs);
  assert.match(legacy.html, /__quantoraLegacyRoot/, 'the bundle must carry the legacy shim when a project imports bare react-dom');
  assert.match(legacy.html, /Sunrise Bakery/);
  const modern = await compilePreviewVfs(calculatorVfs);
  assert.doesNotMatch(modern.html, /__quantoraLegacyRoot/, 'a createRoot project must not pay for the shim');
});

test('the legacy API creates one root per container, reuses it, hydrates, and unmounts', () => {
  const calls = [];
  const fakeRoot = (label) => ({ render: (element) => calls.push([label, 'render', element]), unmount: () => calls.push([label, 'unmount']) });
  const client = {
    createRoot: (container) => { calls.push(['createRoot', container.id]); return fakeRoot(`root:${container.id}`); },
    hydrateRoot: (container, element) => { calls.push(['hydrateRoot', container.id, element]); return fakeRoot(`hydrated:${container.id}`); },
  };
  const dom = { default: { createPortal: () => 'portal', version: '19.0.1' }, createPortal: () => 'portal', version: '19.0.1' };
  const api = createLegacyReactDomApi(client, dom);
  const container = { id: 'root' };

  api.render('<App 1>', container);
  api.render('<App 2>', container);
  assert.deepEqual(calls, [['createRoot', 'root'], ['root:root', 'render', '<App 1>'], ['root:root', 'render', '<App 2>']], 'a second render reuses the root instead of creating another');

  assert.equal(api.unmountComponentAtNode(container), true);
  assert.equal(api.unmountComponentAtNode(container), false, 'nothing left to unmount answers false, as React 17 did');
  assert.deepEqual(calls.at(-1), ['root:root', 'unmount']);

  const other = { id: 'other' };
  api.hydrate('<Server />', other);
  assert.deepEqual(calls.at(-1), ['hydrated:other', 'render', '<Server />'], 'hydrate goes through hydrateRoot');
  assert.deepEqual(calls.at(-2), ['hydrateRoot', 'other', '<Server />']);

  assert.equal(api.namespace.render, api.render, 'the default export carries render, as ReactDOM.render expects');
  assert.equal(api.namespace.createPortal(), 'portal', 'the default export still carries everything react-dom exports');
  assert.equal(api.namespace.createRoot, client.createRoot, 'createRoot is reachable from bare react-dom too');
  assert.equal(api.namespace.version, '19.0.1');
});
