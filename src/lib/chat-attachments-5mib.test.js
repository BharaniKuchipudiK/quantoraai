import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentKindForFile,
  carryDocuments,
  MAX_DOCUMENT_FILE_BYTES,
  MAX_IMAGE_FILE_BYTES,
  partitionAttachments,
} from './chat-attachments.js';

function browserFile(bytes, name = 'large.pdf', type = 'application/pdf') {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

function composerItem(file) {
  return {
    name: file.name,
    size: `${(file.size / 1024).toFixed(1)} KB`,
    type: 'document',
    mimeType: file.type,
    // FileReader still exists for display/session compatibility, but this value
    // must never be the thing partitionAttachments puts on the wire for >3 MiB.
    dataUrl: `data:${file.type};base64,${'x'.repeat(3_600_000)}`,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('document picker ceiling is 5 MiB while vision remains 3 MiB', () => {
  assert.equal(MAX_DOCUMENT_FILE_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_IMAGE_FILE_BYTES, 3 * 1024 * 1024);
});

test('a ready >3 MiB document becomes a tiny private storageRef and carries across follow-ups', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).startsWith('/api/domains')
    ? jsonResponse({ uploadUrl: 'https://storage.test/upload', storageRef: 'v1.payload.signature' })
    : jsonResponse({ Key: 'ok' });
  try {
    const file = browserFile(4 * 1024 * 1024, 'biology.pdf');
    assert.equal(attachmentKindForFile(file), 'document');
    await tick();
    await tick();

    const first = partitionAttachments([composerItem(file)]);
    assert.equal(first.excluded.length, 0);
    assert.deepEqual(first.documents, [{
      name: 'biology.pdf',
      mimeType: 'application/pdf',
      storageRef: 'v1.payload.signature',
    }]);
    assert.equal('dataUrl' in first.documents[0], false, 'large document base64 must not enter /api/chat');

    const ref = { current: null };
    assert.deepEqual(carryDocuments(ref, 'study-a', first.documents), first.documents);
    const follow = partitionAttachments([]);
    const carried = carryDocuments(ref, 'study-a', follow.documents);
    assert.equal(carried.length, 1);
    assert.equal(carried[0].storageRef, 'v1.payload.signature');
    assert.equal(carried[0].carried, true);
    assert.equal('dataUrl' in carried[0], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sending before direct upload finishes reports uploading instead of falling back to oversize base64', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => {});
  try {
    const file = browserFile(4 * 1024 * 1024, 'physics.pdf');
    assert.equal(attachmentKindForFile(file), 'document');
    const partitioned = partitionAttachments([composerItem(file)]);
    assert.equal(partitioned.documents.length, 0);
    assert.deepEqual(partitioned.excluded, [{ name: 'physics.pdf', reason: 'uploading' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
