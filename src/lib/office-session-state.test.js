import test from 'node:test';
import assert from 'node:assert/strict';
import { compactOfficeMessages, latestVerifiedOfficeArtifact } from './office-session-state.js';

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

test('compactOfficeMessages keeps one binary and strips HTML fences from chat text', () => {
  const messages = [
    {
      sender: 'ai',
      text: '✅ generated\n\n```html\n<html>old</html>\n```',
      codeSnippet: '<html>old</html>',
      officeAttachment: { ...artifact, htmlPreview: '<html>old</html>', data: 'B'.repeat(1000), verification: { passed: true, previewFingerprint: 'oldold01' } },
    },
    {
      sender: 'ai',
      text: '✅ generated\n\n```html\n<html>deck</html>\n```',
      codeSnippet: '<html>deck</html>',
      officeAttachment: artifact,
    },
  ];
  const compact = compactOfficeMessages(messages);
  assert.equal(compact[0].officeAttachment.data, undefined);
  assert.equal(compact[0].officeAttachment.htmlPreview, undefined);
  assert.doesNotMatch(compact[1].text, /```html/);
  assert.equal(compact[1].officeAttachment.data, artifact.data);
  assert.equal(compact[1].officeAttachment.htmlPreview, artifact.htmlPreview);
  assert.equal(compact[1].codeSnippet, undefined);
  assert.equal(latestVerifiedOfficeArtifact(compact), compact[1].officeAttachment);
});
