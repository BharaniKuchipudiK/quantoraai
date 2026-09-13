import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBuildArtifactResponse } from './build-artifact-contract.ts';

function fence(language: string, filePath: string, content: string) {
  return `\`\`\`${language} filepath="${filePath}"\n${content}\n\`\`\``;
}

function reactReply(appSource: string) {
  return [
    fence('json', 'package.json', JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { react: '^19.0.1', 'react-dom': '^19.0.1' } }, null, 2)),
    fence('html', 'index.html', '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>'),
    fence('jsx', 'src/main.jsx', "import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App />);"),
    fence('jsx', 'src/App.jsx', appSource),
  ].join('\n\n');
}

test('rejects a React artifact whose generated App.jsx is truncated', () => {
  const reply = reactReply(`
export default function App() {
  const items = [1, 2, 3];
  return (
    <main>
      {items.map((item) => (
        <button key={item} onClick={() => console.log(item)}>{item}</button>
  `);

  assert.deepEqual(validateBuildArtifactResponse(reply), {
    ok: false,
    detailCode: 'browser-source-syntax-invalid',
  });
});

test('accepts the same React artifact once App.jsx is syntactically complete', () => {
  const reply = reactReply(`
export default function App() {
  const items = [1, 2, 3];
  return (
    <main>
      {items.map((item) => (
        <button key={item} onClick={() => console.log(item)}>{item}</button>
      ))}
    </main>
  );
}
  `);

  assert.deepEqual(validateBuildArtifactResponse(reply), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});
