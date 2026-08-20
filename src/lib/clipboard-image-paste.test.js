import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clipboardImageFiles,
  normalizeClipboardImageFile,
} from './clipboard-image-paste.js';

test('clipboardImageFiles keeps image clipboard items and ignores text', () => {
  const png = { name: 'shot.png', type: 'image/png' };
  const clipboardData = {
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => png },
      { kind: 'file', type: 'application/pdf', getAsFile: () => ({ name: 'doc.pdf', type: 'application/pdf' }) },
    ],
    files: [],
  };

  assert.deepEqual(clipboardImageFiles(clipboardData), [png]);
});

test('clipboardImageFiles falls back to clipboard files when items are unavailable', () => {
  const image = { name: 'photo.jpg', type: 'image/jpeg' };
  const pdf = { name: 'doc.pdf', type: 'application/pdf' };
  assert.deepEqual(clipboardImageFiles({ files: [image, pdf] }), [image]);
});

test('normalizeClipboardImageFile preserves named files', () => {
  const image = { name: 'already.png', type: 'image/png' };
  assert.equal(normalizeClipboardImageFile(image, 0, 123), image);
});
