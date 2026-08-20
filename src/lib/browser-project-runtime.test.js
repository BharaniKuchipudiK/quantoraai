import assert from 'node:assert/strict';
import test from 'node:test';
import * as ts from 'typescript';
import {
  compileBrowserProject,
  isBrowserProjectVfs,
  normalizeProjectFiles,
  resolveBrowserProjectEntry,
} from './browser-project-runtime.js';

const project = {
  'package.json': {
    content: JSON.stringify({
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'lucide-react': '^0.344.0' },
      devDependencies: { tailwindcss: '^3.4.1', vite: '^5.1.4' },
    }),
  },
  'index.html': { content: '<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
  'src/main.jsx': { content: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);" },
  'src/App.jsx': { content: "import { Rocket } from 'lucide-react';\nexport default function App(){ return <main><Rocket/><h1>Mission Control is alive</h1></main>; }" },
  'src/index.css': { content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;\nbody{margin:0}' },
};

test('normalizes project files and resolves the browser entry from index.html', () => {
  const normalized = normalizeProjectFiles({ '/src/main.jsx': { content: 'ok' } });
  assert.equal(normalized['src/main.jsx'], 'ok');
  assert.equal(resolveBrowserProjectEntry(project), 'src/main.jsx');
  assert.equal(isBrowserProjectVfs(project), true);
});

test('compiles a React/Vite project into an isolated browser document', () => {
  const result = compileBrowserProject(project, ts);
  assert.equal(result.entry, 'src/main.jsx');
  assert.match(result.html, /type="importmap"/);
  assert.match(result.html, /@quantora\/src\/main\.jsx/);
  assert.match(result.html, /https:\/\/esm\.sh\/react@18\.2\.0/);
  assert.match(result.html, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(result.html, /@tailwind\s+base/);
  assert.doesNotMatch(result.html, /src="\/src\/main\.jsx"/);
  assert.match(result.html, /Mission Control is alive|%3Ch1%3EMission%20Control/);
  assert.match(result.html, /__quantoraProjectPreview/);
  assert.match(result.html, /form-action 'none'/);
});

test('rejects a non-project instead of fabricating a preview', () => {
  assert.equal(isBrowserProjectVfs({ 'index.html': { content: '<h1>Static</h1>' } }), false);
  assert.throws(() => compileBrowserProject({ 'index.html': { content: '<h1>Static</h1>' } }, ts), /No browser entry file/);
});
