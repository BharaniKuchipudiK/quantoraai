import test from 'node:test';
import assert from 'node:assert/strict';
import { latestVerifiedOfficeArtifact } from './office-session-state.js';

const artifact = {
  kind: 'powerpoint',
  fileName: 'deck.pptx',
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  data: 'A'.repeat(1000),
  spec: { version: 2, title: 'Deck', slides: [] },
  htmlPreview: '<html><body>deck</body></html>',
  verification: { passed: true, previewFingerprint: 'abc12345' },
};

test('latestVerifiedOfficeArtifact returns the newest verified canonical artifact', () => {
  const messages = [
    { sender: 'ai', officeAttachment: { ...artifact, verification: { passed: false, previewFingerprint: 'old' } } },
    { sender: 'ai', officeAttachment: artifact },
  ];
  assert.equal(latestVerifiedOfficeArtifact(messages), artifact);
  assert.equal(latestVerifiedOfficeArtifact(messages, 'word'), null);
});

test('incomplete Office envelopes are not treated as active artifact state', () => {
  assert.equal(latestVerifiedOfficeArtifact([{ sender: 'ai', officeAttachment: { ...artifact, htmlPreview: '' } }]), null);
  assert.equal(latestVerifiedOfficeArtifact([{ sender: 'ai', officeAttachment: { ...artifact, spec: null } }]), null);
});
