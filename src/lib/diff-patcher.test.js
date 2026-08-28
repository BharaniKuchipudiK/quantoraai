import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDiffPatch,
  describePatchFailures,
  looksLikePatch,
  parsePatchBlocks,
} from './diff-patcher.js';

const block = (search, replace) => ['<<<<', search, '====', replace, '>>>>'].join('\n');
const PAGE = '<!DOCTYPE html><html><body>\n<h1>Kaapi Bharat</h1>\n<p>Price: 1200</p>\n<footer>2025</footer>\n</body></html>';

/*
 * THE DEFECT THIS FILE EXISTS FOR.
 *
 * The old patcher dropped blocks it could not match and returned a plain
 * string. Two edits went out, one landed, the desk committed the file and the
 * reply claimed both were done.
 */
test('a block that cannot be applied is reported, never dropped in silence', () => {
  const result = applyDiffPatch(PAGE, `${block('<h1>Kaapi Bharat</h1>', '<h1>Hirans</h1>')}\n${block('<p>NOT HERE</p>', '<p>x</p>')}`);
  assert.equal(result.ok, false, 'a partial edit is not a success');
  assert.equal(result.applied.length, 1);
  assert.deepEqual(result.failed.map((f) => f.reason), ['missing']);
  assert.match(result.text, /<h1>Hirans<\/h1>/, 'the edit that did land is kept');
  assert.match(result.text, /Price: 1200/, 'the file is otherwise untouched');
});

test('the report names the count and the text it could not find', () => {
  const result = applyDiffPatch(PAGE, block('<p>NOT HERE</p>', '<p>x</p>'));
  const note = describePatchFailures(result, 'index.html');
  assert.match(note, /0 of 1 edits to `index\.html` were applied/);
  assert.match(note, /the text it was looking for is not in the file/);
  assert.match(note, /<p>NOT HERE<\/p>/);
  assert.equal(describePatchFailures(applyDiffPatch(PAGE, block('<footer>2025</footer>', '<footer>2026</footer>'))), '',
    'a clean patch says nothing');
});

test('a model that reindents is still understood', () => {
  // Models routinely change whitespace when quoting a search block. The intent
  // is unambiguous, so this is a match, not leniency.
  const result = applyDiffPatch(PAGE, block('<p>Price:   1200</p>', '<p>Price: 1500</p>'));
  assert.equal(result.ok, true);
  assert.equal(result.applied[0].how, 'whitespace');
  assert.match(result.text, /Price: 1500/);
});

test('a search block matching two places is refused, not guessed', () => {
  /*
   * The old code used String.replace, which silently took the FIRST occurrence.
   * A price appearing in a card and a cart total would have had one of them
   * changed at random.
   */
  const table = '<td>1200</td>\n<td>1200</td>';
  const result = applyDiffPatch(table, block('<td>1200</td>', '<td>1500</td>'));
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed.map((f) => f.reason), ['ambiguous']);
  assert.equal(result.text, table, 'nothing is changed when which one was meant is a guess');
});

test('a full rewrite is still a legitimate reply', () => {
  const result = applyDiffPatch(PAGE, '<!DOCTYPE html><html><body>brand new</body></html>');
  assert.equal(result.ok, true);
  assert.equal(result.wasPatch, false);
  assert.match(result.text, /brand new/);
});

test('patch markers never reach the build when there is no base file', () => {
  const result = applyDiffPatch('', block('<h1>A</h1>', '<h1>Z</h1>'));
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed.map((f) => f.reason), ['no-base']);
  assert.equal(result.text.includes('<<<<'), false, 'the markers are not content');
});

test('blocks are parsed and recognised', () => {
  assert.equal(looksLikePatch(block('a', 'b')), true);
  assert.equal(looksLikePatch('<h1>plain html</h1>'), false);
  assert.deepEqual(
    parsePatchBlocks(`${block('a', 'b')}\n${block('c', 'd')}`),
    [{ search: 'a', replace: 'b' }, { search: 'c', replace: 'd' }],
  );
});

test('the replacement lands where the search was, not at a squashed offset', () => {
  // A whitespace match must splice at real offsets. Mapping an index from the
  // whitespace-collapsed string back onto the original would cut mid-tag.
  const source = '<div>\n    <span>keep</span>\n    <b>old</b>\n</div>';
  const result = applyDiffPatch(source, block('<b>old</b>', '<b>new</b>'));
  assert.equal(result.ok, true);
  assert.equal(result.text, '<div>\n    <span>keep</span>\n    <b>new</b>\n</div>');
});
