import test from 'node:test';
import assert from 'node:assert/strict';
import { rankDeskFileMatches } from './desk-file-search.js';

test('an empty finder query lists every file in order', () => {
  const files = ['b.js', 'a.js'];
  assert.deepEqual(rankDeskFileMatches(files, ''), ['b.js', 'a.js']);
  assert.deepEqual(rankDeskFileMatches(files, '   '), ['b.js', 'a.js']);
});

test('the finder matches subsequences, not just substrings', () => {
  assert.deepEqual(rankDeskFileMatches(['app.jsx', 'index.html'], 'aj'), ['app.jsx']);
});

test('the finder ranks a basename hit above a directory hit', () => {
  const files = ['src/application/legacy/wrapper.js', 'app.jsx'];
  assert.equal(rankDeskFileMatches(files, 'app')[0], 'app.jsx');
});

test('the finder drops files that do not match at all', () => {
  assert.deepEqual(rankDeskFileMatches(['app.jsx', 'index.html'], 'zzz'), []);
});

test('the finder is case insensitive', () => {
  assert.deepEqual(rankDeskFileMatches(['App.JSX'], 'app'), ['App.JSX']);
});

test('the finder honours its limit', () => {
  const files = Array.from({ length: 80 }, (_, i) => `file${i}.js`);
  assert.equal(rankDeskFileMatches(files, 'file', 10).length, 10);
  assert.equal(rankDeskFileMatches(files, '', 10).length, 10);
});

test('the finder survives junk input', () => {
  assert.deepEqual(rankDeskFileMatches(null, 'a'), []);
  assert.deepEqual(rankDeskFileMatches(['a.js', null, ''], 'a'), ['a.js']);
});
