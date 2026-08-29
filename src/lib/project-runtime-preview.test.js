import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInlineReactRuntimeVfs,
  extractRuntimeDependencies,
  isInlineReactRuntimeCode,
  isProjectRuntimeVfs,
} from './project-runtime-preview.js';

// P0 regression fixture mirrors the calculator shape that broke the live Studio preview.
const calculator = `
import React, { useState } from 'react';
import { Delete, Divide, Minus, Plus, X, Equal } from 'lucide-react';

export default function Calculator() {
  const [value, setValue] = useState('0');
  return <main><output>{value}</output><button onClick={() => setValue('1')}>1</button><Delete /></main>;
}
`;

test('standalone React calculator is recognized as a real runtime project', () => {
  assert.equal(isInlineReactRuntimeCode(calculator), true);
  const vfs = createInlineReactRuntimeVfs(calculator, {});
  assert.ok(vfs);
  assert.equal(isProjectRuntimeVfs(vfs), true);
  const pkg = JSON.parse(vfs['package.json'].content);
  assert.equal(pkg.dependencies.react, '^18.2.0');
  assert.equal(pkg.dependencies['react-dom'], '^18.2.0');
  assert.equal(pkg.dependencies['lucide-react'], '^0.546.0');
  assert.match(vfs['src/App.jsx'].content, /Delete/);
  assert.match(vfs['src/main.jsx'].content, /createRoot/);
});

test('bare imports become Sandpack dependencies instead of being stripped', () => {
  const deps = extractRuntimeDependencies(calculator);
  assert.equal(deps.react, '^18.2.0');
  assert.equal(deps['react-dom'], '^18.2.0');
  assert.equal(deps['lucide-react'], '^0.546.0');
});

test('root styles.css is preserved when hydrating an inline React runtime', () => {
  const vfs = createInlineReactRuntimeVfs(calculator, {
    'styles.css': { content: '.shell{display:grid}' },
  });
  assert.match(vfs['src/index.css'].content, /\.shell\{display:grid\}/);
});

test('missing relative CSS gets a safe empty virtual file instead of a compile failure', () => {
  const styledCalculator = `import './Missing.css';\n${calculator}`;
  const vfs = createInlineReactRuntimeVfs(styledCalculator, {});
  assert.ok(vfs['src/Missing.css']);
  assert.equal(vfs['src/Missing.css'].content, '');
});

test('plain self-contained HTML stays on the lightweight iframe path', () => {
  assert.equal(isInlineReactRuntimeCode('<!doctype html><html><body>ok</body></html>'), false);
  assert.equal(createInlineReactRuntimeVfs('<!doctype html><html><body>ok</body></html>', {}), null);
});
