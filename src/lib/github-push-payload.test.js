/**
 * What leaves the desk, and what it is called.
 *
 * The push itself is authorized and tested server-side. This covers the part
 * that runs in the browser and decides *which* files are sent — a decision with
 * no error message attached, because a file quietly omitted here just never
 * appears in the repository and nobody is told.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutFilesToVfs,
  deskFilesForPush,
  pushOutcomeMessage,
  suggestRepositoryName,
} from './github-workspace.js';

test('generated and vendored directories are left behind', () => {
  const files = deskFilesForPush([
    { path: 'index.html', content: '<h1>hi</h1>' },
    { path: 'src/app.js', content: 'x' },
    { path: 'node_modules/react/index.js', content: 'huge' },
    { path: 'dist/bundle.js', content: 'built' },
    { path: 'coverage/lcov.info', content: 'report' },
    { path: '.git/config', content: 'secret' },
  ]);

  assert.deepEqual(files.map((file) => file.path), ['index.html', 'src/app.js']);
});

test('a directory that merely starts with a skipped name is kept', () => {
  // "distribution/" and "buildings/" are ordinary source directories. A prefix
  // match rather than a path-segment match would silently drop them.
  const files = deskFilesForPush([
    { path: 'distribution/plan.md', content: 'a' },
    { path: 'buildings/list.json', content: 'b' },
    { path: 'src/dist-helper.js', content: 'c' },
  ]);

  assert.deepEqual(files.map((file) => file.path), [
    'distribution/plan.md',
    'buildings/list.json',
    'src/dist-helper.js',
  ]);
});

test('leading slashes are stripped so paths are repository-relative', () => {
  const files = deskFilesForPush([{ path: '/index.html', content: 'x' }]);
  assert.equal(files[0].path, 'index.html');
});

test('entries without real content are dropped rather than sent as empty files', () => {
  const files = deskFilesForPush([
    { path: 'a.js', content: 'ok' },
    { path: 'b.js' },
    { path: 'c.js', content: null },
    null,
  ]);
  assert.deepEqual(files.map((file) => file.path), ['a.js']);
});

test('a repository name is slugified from the project name', () => {
  assert.equal(suggestRepositoryName('My Coffee Shop!'), 'my-coffee-shop');
  assert.equal(suggestRepositoryName('  Trailing --- dashes  '), 'trailing-dashes');
});

test('an unnamed project gets a dated name rather than a colliding generic one', () => {
  const name = suggestRepositoryName('');
  assert.match(name, /^quantora-build-\d{4}-\d{2}-\d{2}$/);
});

test('the outcome message distinguishes creating a branch from adding to one', () => {
  assert.match(pushOutcomeMessage({ fileCount: 3, branch: 'main', createdBranch: true }), /created "main"/);
  assert.match(pushOutcomeMessage({ fileCount: 3, branch: 'main', createdBranch: false }), /Pushed 3 files to "main"/);
  // One file is not "1 files".
  assert.match(pushOutcomeMessage({ fileCount: 1, branch: 'main', createdBranch: false }), /1 file to/);
});

/* ------------------------------------------------------------------ *
 * Files coming back in
 * ------------------------------------------------------------------ */

/**
 * The desk stores each file as `{ content, language }`, not as a bare string.
 *
 * The first version of checkoutFilesToVfs wrote strings. Nothing threw: every
 * consumer read an entry with no `content`, so a checkout loaded and the desk
 * reported "the shell is empty while Preview has files" with no error anywhere
 * pointing at the cause. A shape mismatch across a boundary fails silently,
 * which is exactly why it gets a test rather than a careful reading.
 */
test('a checkout becomes desk entries, not bare strings', () => {
  const vfs = checkoutFilesToVfs([
    { path: 'index.html', content: '<h1>hi</h1>' },
    { path: 'src/app.tsx', content: 'export const a = 1;' },
  ]);

  assert.equal(typeof vfs['index.html'], 'object', 'a string here loads a desk that reads as empty');
  assert.equal(vfs['index.html'].content, '<h1>hi</h1>');
  assert.equal(vfs['index.html'].language, 'html');
  assert.equal(vfs['src/app.tsx'].language, 'tsx');
});

test('an unknown extension still loads, as plain text', () => {
  const vfs = checkoutFilesToVfs([{ path: 'LICENSE', content: 'MIT' }]);
  assert.equal(vfs.LICENSE.content, 'MIT');
  assert.equal(vfs.LICENSE.language, 'plaintext', 'an unrecognised file is still a file');
});

test('malformed entries are skipped rather than loaded as undefined', () => {
  const vfs = checkoutFilesToVfs([
    { path: 'good.js', content: 'ok' },
    { path: 'no-content.js' },
    { content: 'no path' },
    null,
  ]);
  assert.deepEqual(Object.keys(vfs), ['good.js']);
});

test('an empty checkout produces an empty map the caller must check', () => {
  // Callers treat this as a failure to read, never as "replace the desk with
  // nothing" — the files on the desk may be the only copy that exists.
  assert.deepEqual(checkoutFilesToVfs([]), {});
});
