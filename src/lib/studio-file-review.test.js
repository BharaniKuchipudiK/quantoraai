import assert from 'node:assert/strict';
import test from 'node:test';
import { diffVfsReview, lineDiffStats, unifiedFileDiff, unifiedTreeDiff } from './studio-file-review.js';

test('identical files produce no review rows', () => {
  const vfs = { 'src/App.jsx': { content: 'export default function App(){return 1}' } };
  assert.deepEqual(diffVfsReview(vfs, vfs), []);
});

test('a new file counts every line as added', () => {
  const after = { 'index.html': { content: '<!doctype html>\n<html>\n</html>' } };
  const review = diffVfsReview({}, after);
  assert.equal(review.length, 1);
  assert.equal(review[0].path, 'index.html');
  assert.equal(review[0].added, 3);
  assert.equal(review[0].removed, 0);
  assert.equal(review[0].exact, true);
  assert.ok(review[0].hunks.some((hunk) => hunk.lines.includes('+<!doctype html>')));
});

test('a one-line edit is +1 −1', () => {
  const stats = lineDiffStats('hello\nworld', 'hello\nthere');
  assert.deepEqual(stats, { added: 1, removed: 1, exact: true });
});

test('a follow-up that only changes App.jsx does not invent other files', () => {
  const before = {
    'package.json': { content: '{"name":"x"}' },
    'src/App.jsx': { content: 'export default function App(){return <h1>A</h1>}' },
  };
  const after = {
    ...before,
    'src/App.jsx': { content: 'export default function App(){return <h1>B</h1>}' },
  };
  const review = diffVfsReview(before, after);
  assert.equal(review.length, 1);
  assert.equal(review[0].path, 'src/App.jsx');
  assert.equal(review[0].added > 0 || review[0].removed > 0, true);
});

const before = [
  'export default function App() {',
  '  return (',
  '    <main>',
  '      <h1>Mission Control is alive</h1>',
  '      <p>Docking bay clear.</p>',
  '      <p>Fuel margin nominal.</p>',
  '      <p>Crew roster locked.</p>',
  '      <p>Telemetry is nominal.</p>',
  '      <p>Heat shield green.</p>',
  '    </main>',
  '  );',
  '}',
].join('\n');
const after = before.replace('Mission Control is alive', 'Mission Control is patched');

test('a unified diff prints the real removed and added lines', () => {
  const diff = unifiedFileDiff('src/App.jsx', before, after);
  assert.equal(diff.exact, true);
  assert.ok(diff.lines.includes('-      <h1>Mission Control is alive</h1>'));
  assert.ok(diff.lines.includes('+      <h1>Mission Control is patched</h1>'));
  assert.ok(diff.lines.some((line) => /^@@ -\d+,\d+ \+\d+,\d+ @@$/.test(line)));
});

test('a unified diff stays a hunk instead of dumping the whole file', () => {
  const diff = unifiedFileDiff('src/App.jsx', before, after);
  assert.ok(diff.lines.includes('       <p>Fuel margin nominal.</p>'));
  assert.equal(diff.lines.some((line) => line.includes('Telemetry is nominal')), false);
  assert.equal(diff.lines.some((line) => line.includes('Heat shield green')), false);
});

test('a deleted file diffs against /dev/null rather than vanishing', () => {
  const diff = unifiedFileDiff('products.json', '[]', undefined);
  assert.ok(diff.lines.includes('+++ /dev/null'));
  assert.ok(diff.lines.includes('-[]'));
});

test('a file too long to align exactly says so instead of inventing hunks', () => {
  const huge = Array.from({ length: 900 }, (_, index) => `line ${index}`).join('\n');
  const diff = unifiedFileDiff('src/App.jsx', huge, `${huge}\nline 900`);
  assert.equal(diff.exact, false);
  assert.equal(diff.lines.some((line) => line.startsWith('@@')), false);
  assert.match(diff.lines.join('\n'), /too large to diff exactly/i);
});

test('a tree diff names only the file that actually changed', () => {
  const lines = unifiedTreeDiff(
    { 'index.html': '<!doctype html>', 'src/App.jsx': before },
    { 'index.html': '<!doctype html>', 'src/App.jsx': after },
  );
  assert.ok(lines.includes('diff --git a/src/App.jsx b/src/App.jsx'));
  assert.equal(lines.some((line) => line.includes('index.html')), false);
});

test('a tree with no edits produces no diff lines', () => {
  const tree = { 'src/App.jsx': before };
  assert.deepEqual(unifiedTreeDiff(tree, tree), []);
});

test('review rows carry the real hunk, not only +/− counts', () => {
  const review = diffVfsReview(
    { 'src/App.jsx': { content: before } },
    { 'src/App.jsx': { content: after } },
  );
  assert.equal(review.length, 1);
  assert.equal(review[0].path, 'src/App.jsx');
  assert.ok(review[0].hunks.some((hunk) => /^@@ -\d+,\d+ \+\d+,\d+ @@$/.test(hunk.header)));
  const lines = review[0].hunks.flatMap((hunk) => hunk.lines);
  assert.ok(lines.includes('-      <h1>Mission Control is alive</h1>'));
  assert.ok(lines.includes('+      <h1>Mission Control is patched</h1>'));
  assert.equal(lines.some((line) => line.includes('Telemetry is nominal')), false);
});
