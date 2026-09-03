import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the representation browser gate is registered and enforced in CI', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /scripts\/study-representation-browser-gate\.mjs/);
  assert.match(ci, /STUDY_REPRESENTATION_OUTCOME/);
  assert.match(ci, /id: study_representation_gate/);
});

test('the representation browser gate anchors on durable Study hooks, not prose or invented attributes', () => {
  const gate = read('scripts/study-representation-browser-gate.mjs');
  assert.match(gate, /data-quantora-study-picture="physics-motion"/);
  assert.match(gate, /data-quantora-study-picture-variant="vector-components"/);
  assert.match(gate, /data-quantora-study-lesson="true"/);
  assert.match(gate, /data-quantora-advisor="education"/);
  assert.match(gate, /data-quantora-advisor="finance"/);
  assert.match(gate, /data-quantora-assistant-prose="true"/);
  assert.match(gate, /svg\[role="img"\]/);
  assert.doesNotMatch(gate, /data-quantora-chat-message/);
});

test('the unsupported-concept check waits for a new lesson instead of the previous vector turn', () => {
  const gate = read('scripts/study-representation-browser-gate.mjs');
  const unsupportedBlock = gate.slice(gate.indexOf('unsupported-concept:'));
  assert.match(unsupportedBlock, /lessonsBeforeUnsupported/);
  assert.match(unsupportedBlock, /\.nth\(lessonsBeforeUnsupported\)/);
  assert.doesNotMatch(
    unsupportedBlock.slice(0, unsupportedBlock.indexOf('workspace-isolation-check')),
    /study-lesson="true"\]'\)\.last\(\)/,
  );
});
