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
