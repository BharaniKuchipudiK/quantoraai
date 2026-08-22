import assert from 'node:assert/strict';
import test from 'node:test';
import { decorateStudyMessage, splitStudySegments } from './study-pictures.js';

test('Study picture tags become real segments, not markdown text', () => {
  const parts = splitStudySegments('Hook.\n<quantora-study-picture kind="apple-tree" caption="The apple" />\nThen wait.');
  assert.equal(parts[1].type, 'picture');
  assert.equal(parts[1].kind, 'apple-tree');
  assert.equal(parts[1].caption, 'The apple');
});

test('a promised visual workspace becomes a real in-chat lab', () => {
  const decorated = decorateStudyMessage('What has been added to your visual workspace: Dedicated FBD Vector Tab.');
  assert.match(decorated, /quantora-study-lab kind="fbd"/);
  const parts = splitStudySegments(decorated);
  assert.equal(parts[0].type, 'lab');
  assert.equal(parts[0].kind, 'fbd');
});
