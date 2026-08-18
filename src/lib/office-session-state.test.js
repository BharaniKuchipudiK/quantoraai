import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latestVerifiedOfficeArtifact,
  lightweightOfficeArtifact,
  sanitizeSessionsForPersistence,
} from './office-session-state.js';

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

test('lightweightOfficeArtifact removes binary but preserves canonical revision state', () => {
  const light = lightweightOfficeArtifact(artifact);
  assert.equal(light.data, undefined);
  assert.equal(light.spec.title, 'Deck');
  assert.equal(light.htmlPreview, artifact.htmlPreview);
  assert.equal(light.verification.previewFingerprint, 'abc12345');
});

test('session persistence strips Office base64 without mutating live state', () => {
  const sessions = [{ id: 's1', messages: [{ id: 1, sender: 'ai', officeAttachment: artifact }] }];
  const persisted = sanitizeSessionsForPersistence(sessions);
  assert.equal(persisted[0].messages[0].officeAttachment.data, undefined);
  assert.equal(sessions[0].messages[0].officeAttachment.data.length, 1000);
});
