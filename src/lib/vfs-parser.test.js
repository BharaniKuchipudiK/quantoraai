import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVFSFromMarkdown } from './vfs-parser.js';

test('verified Office HTML replaces stale workspace VFS without mutation', () => {
  const officeHtml = '<!doctype html><html><body><section>Deck</section><script type="application/json" id="quantora-office-manifest">{"version":1}</script></body></html>';
  const text = `✅ generated\n\n\`\`\`html\n${officeHtml}\n\`\`\``;
  const parsed = parseVFSFromMarkdown(text, {
    'presentation.html': { content: '<html>OLD</html>', language: 'html' },
    'App.jsx': { content: 'old app', language: 'jsx' },
  });

  assert.deepEqual(Object.keys(parsed), ['presentation.html']);
  assert.equal(parsed['presentation.html'].content, `${officeHtml}\n`);
});

test('plain-language replies never revive an older code workspace', () => {
  const parsed = parseVFSFromMarkdown('Here are the best neighborhoods and hotels for your trip.', {
    'package.json': { content: '{"name":"old-project"}', language: 'json' },
    'src/main.jsx': { content: 'console.log("old")', language: 'jsx' },
  });

  assert.deepEqual(parsed, {});
});

test('vanilla javascript without a filepath becomes script.js, not App.jsx', () => {
  const text = [
    '```html',
    '<!DOCTYPE html><html><body><button>7</button></body></html>',
    '```',
    '```javascript',
    'document.querySelector("button").onclick = () => {};',
    '```',
    '```css',
    '.key{display:grid}',
    '```',
  ].join('\n');
  const parsed = parseVFSFromMarkdown(text);
  assert.ok(parsed['index.html']);
  assert.ok(parsed['styles.css']);
  assert.ok(parsed['script.js']);
  assert.equal(parsed['App.jsx'], undefined);
});

test('React source without a filepath still lands in App.jsx', () => {
  const parsed = parseVFSFromMarkdown('```jsx\nexport default function App(){ return <main>Hi</main>; }\n```');
  assert.ok(parsed['App.jsx']);
});

test('unquoted filepath attributes still populate the VFS', () => {
  const parsed = parseVFSFromMarkdown('```html filepath=index.html\n<!DOCTYPE html><html><body>ok</body></html>\n```');
  assert.ok(parsed['index.html']);
  assert.match(parsed['index.html'].content, /<!DOCTYPE html>/);
});

test('real code updates still merge against the existing VFS', () => {
  const parsed = parseVFSFromMarkdown('```jsx filepath="src/App.jsx"\nexport default function App(){ return <main>Updated</main>; }\n```', {
    'package.json': { content: '{"name":"project"}', language: 'json' },
    'src/App.jsx': { content: 'export default function App(){ return null; }', language: 'jsx' },
  });

  assert.equal(parsed['package.json'].content, '{"name":"project"}');
  assert.match(parsed['src/App.jsx'].content, /Updated/);
});
