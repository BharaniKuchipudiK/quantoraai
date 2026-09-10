import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATTACHMENT_REF_TTL_SECONDS,
  createSignedAttachmentUpload,
  verifyAttachmentStorageRef,
} from './attachment-storage.js';

const ORIGINAL = {
  session: process.env.SESSION_SECRET,
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restore() {
  if (ORIGINAL.session == null) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = ORIGINAL.session;
  if (ORIGINAL.url == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = ORIGINAL.url;
  if (ORIGINAL.key == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL.key;
}

test('server-minted attachment refs are owner-partitioned, bounded and tamper evident', async () => {
  const originalFetch = globalThis.fetch;
  process.env.SESSION_SECRET = 'test-session-secret-that-is-deliberately-long-enough';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  let request = null;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ url: '/object/upload/sign/quantora-attachments/chat/x?token=signed-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const result = await createSignedAttachmentUpload({ ownerSub: 'learner-123', name: '../Exam notes.pdf' });
    assert.equal(result.ok, true);
    assert.match(result.uploadUrl, /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/upload\/sign\//);
    assert.match(request.url, /storage\/v1\/object\/upload\/sign\/quantora-attachments\/chat\//);
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.body, '{}');

    const verified = verifyAttachmentStorageRef(result.storageRef);
    assert.ok(verified);
    assert.match(verified.path, /^chat\/[a-f0-9]{16}\/\d{8}\/[a-f0-9-]{36}-Exam-notes\.pdf$/);
    assert.equal(verified.ownerSub, 'learner-123');
    assert.ok(verified.exp > Math.floor(Date.now() / 1000));
    assert.ok(verified.exp <= Math.floor(Date.now() / 1000) + ATTACHMENT_REF_TTL_SECONDS + 1);

    const last = result.storageRef.at(-1);
    const tampered = `${result.storageRef.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;
    assert.equal(verifyAttachmentStorageRef(tampered), null);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test('attachment storage fails closed without the existing server secrets', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SESSION_SECRET = 'test-session-secret-that-is-deliberately-long-enough';
  try {
    assert.deepEqual(await createSignedAttachmentUpload({ ownerSub: 'x', name: 'a.pdf' }), {
      ok: false,
      reason: 'storage-unconfigured',
    });
    assert.equal(verifyAttachmentStorageRef('v1.fake.fake'), null);
  } finally {
    restore();
  }
});
