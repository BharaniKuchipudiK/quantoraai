import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVFSWithReport } from './vfs-parser.js';

/*
 * The files-only wrapper is gone. It survived one commit with no production
 * caller and the wiring gate flagged it — a lossy signature left lying around
 * is how the silent partial-patch bug existed in the first place, so tests go
 * through the reporting API like everything else.
 */
const parseVFSFromMarkdown = (text, currentVfs = {}) => parseVFSWithReport(text, currentVfs).vfs;

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

test('a CSS search/replace patch updates the previous stylesheet instead of becoming the preview', () => {
  const previous = {
    'index.html': { content: '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><button>7</button></body></html>', language: 'html' },
    'styles.css': { content: '.keypad{display:grid}', language: 'css' },
  };
  const patch = [
    '```css filepath="styles.css"',
    '<<<<',
    '.keypad{display:grid}',
    '====',
    '.keypad{display:grid;grid-template-columns:repeat(10,1fr)}',
    '>>>>',
    '```',
  ].join('\n');
  const parsed = parseVFSFromMarkdown(patch, previous);
  assert.match(parsed['index.html'].content, /<!DOCTYPE html>/);
  assert.match(parsed['styles.css'].content, /repeat\(10,1fr\)/);
  assert.doesNotMatch(parsed['styles.css'].content, /<<<</);
});

test('a dangling patch with no previous file is not a preview artifact', () => {
  const parsed = parseVFSFromMarkdown('```css filepath="styles.css"\n<<<<\n.a{color:red}\n====\n.a{color:blue}\n>>>>\n```');
  assert.deepEqual(parsed, {});
});

test('chat talk before an HTML fence is not stored as index.html', () => {
  const parsed = parseVFSFromMarkdown(`Got it! Weather app for iOS.

\`\`\`html filepath="index.html"
<!DOCTYPE html><html><body><h1>Weather</h1></body></html>
\`\`\`
`);
  assert.doesNotMatch(parsed['index.html'].content, /Got it/);
  assert.match(parsed['index.html'].content, /<h1>Weather<\/h1>/);
});

test('an unclosed HTML fence still becomes a file, not the chat', () => {
  const parsed = parseVFSFromMarkdown(`Here is the page.

\`\`\`html filepath="index.html"
<!DOCTYPE html><html><body>Hi</body></html>
`);
  assert.match(parsed['index.html'].content, /<body>Hi<\/body>/);
  assert.doesNotMatch(parsed['index.html'].content, /Here is the page/);
});

/*
 * A PATCH TO index.html HAD NEVER ONCE BEEN ACCEPTED.
 *
 * isolateHtmlDocument looks for <!DOCTYPE html> or <html>. A search/replace
 * block contains neither, so an html-language patch was thrown away before the
 * patch path was ever reached. Full-document rewrites were not a policy choice
 * here — they were the only thing that could get through, which is why a
 * one-word rename regenerated 970 lines and timed out.
 */
test('a search/replace patch to index.html is applied', () => {
  const current = {
    'index.html': {
      content: '<!DOCTYPE html><html><body>\n<h1>Kaapi Bharat</h1>\n<p>Price: 1200</p>\n</body></html>',
      language: 'html',
    },
  };
  const reply = 'Renamed it.\n\n```html filepath="index.html"\n<<<<\n<h1>Kaapi Bharat</h1>\n====\n<h1>Hirans Coffee</h1>\n>>>>\n```';
  const { vfs, patchFailures } = parseVFSWithReport(reply, current);
  assert.deepEqual(patchFailures, []);
  assert.match(vfs['index.html'].content, /<h1>Hirans Coffee<\/h1>/);
  assert.match(vfs['index.html'].content, /Price: 1200/, 'the rest of the page survives');
  assert.match(vfs['index.html'].content, /<!DOCTYPE html>/, 'the document is not truncated');
});

test('an edit that only partly applies is reported to the caller', () => {
  const current = {
    'index.html': { content: '<!DOCTYPE html><html><body>\n<h1>A</h1>\n<p>B</p>\n</body></html>', language: 'html' },
  };
  const reply = 'Both done.\n\n```html filepath="index.html"\n<<<<\n<h1>A</h1>\n====\n<h1>Z</h1>\n>>>>\n<<<<\n<p>NOT HERE</p>\n====\n<p>Y</p>\n>>>>\n```';
  const { vfs, patchFailures } = parseVFSWithReport(reply, current);
  assert.equal(patchFailures.length, 1);
  assert.equal(patchFailures[0].filepath, 'index.html');
  assert.deepEqual(patchFailures[0].result.failed.map((f) => f.reason), ['missing']);
  assert.match(vfs['index.html'].content, /<h1>Z<\/h1>/, 'what landed is kept');
});

test('a patch where nothing lands leaves the desk untouched', () => {
  const content = '<!DOCTYPE html><html><body><h1>A</h1></body></html>';
  const current = { 'index.html': { content, language: 'html' } };
  const reply = 'Changed it.\n\n```html filepath="index.html"\n<<<<\n<h1>NOT HERE</h1>\n====\n<h1>Z</h1>\n>>>>\n```';
  const { vfs, patchFailures } = parseVFSWithReport(reply, current);
  assert.equal(Object.keys(vfs).length, 0, 'a no-op edit must not be committed as a build');
  assert.equal(patchFailures.length, 1);
});

test('a full-document reply still works after the patch reordering', () => {
  const reply = 'Here.\n\n```html filepath="index.html"\n<!DOCTYPE html><html><body><h1>Fresh</h1></body></html>\n```';
  const { vfs, patchFailures } = parseVFSWithReport(reply, {});
  assert.deepEqual(patchFailures, []);
  assert.match(vfs['index.html'].content, /<h1>Fresh<\/h1>/);
});
