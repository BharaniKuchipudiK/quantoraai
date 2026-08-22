import assert from 'node:assert/strict';
import test from 'node:test';
import { decorateStudyMessage, splitStudySegments } from './study-pictures.js';

test('Study picture tags become real segments, not markdown text', () => {
  const parts = splitStudySegments('Hook.\n<quantora-study-picture kind="apple-tree" caption="The apple" />\nThen wait.');
  assert.equal(parts[1].type, 'picture');
  assert.equal(parts[1].kind, 'apple-tree');
  assert.equal(parts[1].caption, 'The apple');
});

test('a Newton lesson without tags still gets drawings', () => {
  const decorated = decorateStudyMessage("Newton's First Law. A book on a table does not move.");
  assert.match(decorated, /quantora-study-picture kind="apple-tree"/);
  assert.match(decorated, /quantora-study-picture kind="book-table"/);
});
