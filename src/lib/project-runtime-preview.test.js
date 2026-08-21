import test from 'node:test';
import assert from 'node:assert/strict';
import { isProjectRuntimeVfs, projectRuntimeConfig } from './project-runtime-preview.js';

test('detects a multi-file Vite React project and excludes package.json from rendered files', () => {
  const vfs = {
    'package.json': { content: JSON.stringify({ dependencies: { react: '^19.0.0' } }) },
    'index.html': { content: '<div id="root"></div>' },
    'src/main.jsx': { content: "import App from './App.jsx';" },
    'src/App.jsx': { content: 'export default function App(){return <h1>Hello</h1>}' },
  };
  assert.equal(isProjectRuntimeVfs(vfs), true);
  const config = projectRuntimeConfig(vfs);
  assert.equal(config.template, 'vite-react');
  assert.equal(config.files['/src/App.jsx'].code.includes('Hello'), true);
  assert.equal(config.files['/package.json'], undefined);
  assert.equal(config.dependencies.react, '^19.0.0');
});

test('does not treat a single loose code file as a full project runtime', () => {
  assert.equal(isProjectRuntimeVfs({ 'App.jsx': { content: 'export default 1' } }), false);
  assert.equal(projectRuntimeConfig({ 'App.jsx': { content: 'export default 1' } }), null);
});
