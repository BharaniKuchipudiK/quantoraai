import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimLargeDocumentUpload,
  registerLargeDocumentUpload,
} from './large-document-upload.js';

function browserFile(bytes, name = 'large.pdf', type = 'application/pdf') {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

function attachmentFor(file) {
  return {
    name: file.name,
    size: `${(file.size / 1024).toFixed(1)} KB`,
    mimeType: file.type,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('large document transport starts only above 3 MiB and never above 5 MiB', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).startsWith('/api/domains')
    ? jsonResponse({ uploadUrl: 'https://storage.test/upload', storageRef: 'v1.boundary.signature' })
    : jsonResponse({ Key: 'ok' });
  try {
    assert.equal(registerLargeDocumentUpload(browserFile(3 * 1024 * 1024, 'three.pdf')), false);
    const justOver = browserFile(3 * 1024 * 1024 + 1, 'just-over.pdf');
    const exactFive = browserFile(5 * 1024 * 1024, 'five.pdf');
    assert.equal(registerLargeDocumentUpload(justOver), true);
    assert.equal(registerLargeDocumentUpload(exactFive), true);
    assert.equal(registerLargeDocumentUpload(browserFile(5 * 1024 * 1024 + 1, 'too-big.pdf')), false);
    await tick();
    assert.equal(claimLargeDocumentUpload(attachmentFor(justOver))?.status, 'ready');
    assert.equal(claimLargeDocumentUpload(attachmentFor(exactFive))?.status, 'ready');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a send sees pending honestly, then claims the same ready private reference', async () => {
  const originalFetch = globalThis.fetch;
  let releaseToken;
  globalThis.fetch = (url) => {
    if (String(url).startsWith('/api/domains')) {
      return new Promise((resolve) => { releaseToken = () => resolve(jsonResponse({ uploadUrl: 'https://storage.test/upload', storageRef: 'v1.opaque.sig' })); });
    }
    return Promise.resolve(jsonResponse({ Key: 'ok' }));
  };
  try {
    const file = browserFile(3 * 1024 * 1024 + 1, 'course-notes.pdf');
    assert.equal(registerLargeDocumentUpload(file), true);
    const item = attachmentFor(file);
    assert.deepEqual(claimLargeDocumentUpload(item), { status: 'pending' });
    releaseToken();
    await tick();
    await tick();
    assert.deepEqual(claimLargeDocumentUpload(item), { status: 'ready', storageRef: 'v1.opaque.sig' });
    assert.equal(claimLargeDocumentUpload(item), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a failed private upload is named and consumed rather than retried as inline 7 MB JSON', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('storage down'); };
  try {
    const file = browserFile(4 * 1024 * 1024, 'exam.pdf');
    assert.equal(registerLargeDocumentUpload(file), true);
    await tick();
    const item = attachmentFor(file);
    assert.deepEqual(claimLargeDocumentUpload(item), { status: 'failed', error: 'storage down' });
    assert.equal(claimLargeDocumentUpload(item), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
