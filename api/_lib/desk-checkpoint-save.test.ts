import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
const { saveDeskCheckpointsRevision } = await import('./store.js');
const rows = [{ checkpoint_id: 'a', seq: 0, label: null, origin: 'commit', hash: 'h', delta: { changed: { 'a.txt': 'a' }, removed: [] } }];
test('checkpoint replacement sends the caller revision to the atomic RPC', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /rpc\/replace_desk_checkpoints$/);
    const body = JSON.parse(String(options?.body));
    assert.equal(body.p_expected_revision, 7);
    assert.equal(body.p_user_sub, 'owner');
    assert.equal(body.p_session_id, 'desk');
    return new Response(JSON.stringify({ status: 'saved', revision: 8 }), { status: 200 });
  };
  try { assert.deepEqual(await saveDeskCheckpointsRevision('owner', 'desk', rows, 7), { status: 'saved', revision: 8 }); }
  finally { globalThis.fetch = original; }
});
test('a conflicting RPC result is never acknowledged as saved', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'conflict' }), { status: 200 });
  try { assert.deepEqual(await saveDeskCheckpointsRevision('owner', 'desk', rows, 7), { status: 'conflict' }); }
  finally { globalThis.fetch = original; }
});
