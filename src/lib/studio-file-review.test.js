import assert from 'node:assert/strict';
import test from 'node:test';
import { diffVfsReview, lineDiffStats } from './studio-file-review.js';

test('identical files produce no review rows', () => {
  const vfs = { 'src/App.jsx': { content: 'export default function App(){return 1}' } };
  assert.deepEqual(diffVfsReview(vfs, vfs), []);
});

test('a new file counts every line as added', () => {
  const after = { 'index.html': { content: '<!doctype html>\n<html>\n</html>' } };
  assert.deepEqual(diffVfsReview({}, after), [
    { path: 'index.html', added: 3, removed: 0, exact: true },
  ]);
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
