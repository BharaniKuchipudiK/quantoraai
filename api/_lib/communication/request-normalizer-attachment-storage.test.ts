import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCommunicationRequest } from './request-normalizer.js';

test('communication normalizer accepts only bounded opaque stored-document refs', () => {
  const good = normalizeCommunicationRequest({
    message: 'read this',
    attachedDocuments: [{
      name: 'exam.pdf',
      mimeType: 'application/pdf',
      storageRef: 'v1.abc_DEF-123.signature_456',
      carried: true,
    }],
  });
  assert.deepEqual(good.attachedDocuments, [{
    name: 'exam.pdf',
    mimeType: 'application/pdf',
    storageRef: 'v1.abc_DEF-123.signature_456',
    carried: true,
  }]);

  const bad = normalizeCommunicationRequest({
    message: 'read this',
    attachedDocuments: [
      { name: 'raw.pdf', storageRef: 'chat/user/private.pdf' },
      { name: 'url.pdf', storageRef: 'https://example.com/private.pdf' },
      { name: 'image.png', dataUrl: 'data:image/png;base64,AAAA' },
    ],
  });
  assert.deepEqual(bad.attachedDocuments, []);
});

test('a valid storage ref wins exclusively over co-supplied inline data', () => {
  const request = normalizeCommunicationRequest({
    message: 'read',
    attachedDocuments: [{
      name: 'large.pdf',
      mimeType: 'application/pdf',
      storageRef: 'v1.payload.signature',
      dataUrl: `data:application/pdf;base64,${'A'.repeat(1000)}`,
    }],
  });
  assert.deepEqual(request.attachedDocuments, [{
    name: 'large.pdf',
    mimeType: 'application/pdf',
    storageRef: 'v1.payload.signature',
    carried: false,
  }]);
});

test('small inline document contract remains unchanged', () => {
  const request = normalizeCommunicationRequest({
    message: 'read',
    attachedDocuments: [{
      name: 'notes.txt',
      mimeType: 'text/plain',
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
    }],
  });
  assert.equal(request.attachedDocuments.length, 1);
  assert.equal(request.attachedDocuments[0].dataUrl, 'data:text/plain;base64,aGVsbG8=');
  assert.equal(request.attachedDocuments[0].storageRef, undefined);
});
