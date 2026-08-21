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

test('real code updates still merge against the existing VFS', () => {
  const parsed = parseVFSFromMarkdown('```jsx filepath="src/App.jsx"\nexport default function App(){ return <main>Updated</main>; }\n```', {
    'package.json': { content: '{"name":"project"}', language: 'json' },
    'src/App.jsx': { content: 'export default function App(){ return null; }', language: 'jsx' },
  });

  assert.equal(parsed['package.json'].content, '{"name":"project"}');
  assert.match(parsed['src/App.jsx'].content, /Updated/);
});
