import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudyContinuityCloud, STUDY_CONTINUITY_CLOUD_VERSION as version } from './study-continuity-cloud.js';
import { makeStudyContinuityCheckpoint } from './study-session-continuity.js';
const scope = { accountKey: 'student@example.test', sessionId: 'chat-one', topic: 'Motion graphs' };
const revision = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const checkpoint = (phase = 'explain') => makeStudyContinuityCheckpoint({ sessionId: scope.sessionId,
  mission: { label: scope.topic, status: 'active', topicAligned: true, source: 'guided_chip', phase } });
function backend() {
  let row = null; let seq = 0;
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    assert.equal(url, '/api/study-learning-compass');
    assert.equal(init.credentials, 'include');
    assert.equal(init.cache, 'no-store');
    if (body.action === 'continuity-read') return Response.json({ version, revision: row?.revision || null, checkpoint: row?.checkpoint || null, cleared: Boolean(row && !row.checkpoint) });
    if ((row?.revision || null) !== body.revision) return Response.json({}, { status: 409 });
    row = { revision: revision(++seq), checkpoint: body.action === 'continuity-clear' ? null : body.checkpoint };
    return Response.json({ version, ...row, cleared: !row.checkpoint });
  };
  return { fetcher, calls, get row() { return row; } };
}
test('a second independent device reads the saved checkpoint without local storage', async () => {
  const server = backend(); const a = createStudyContinuityCloud(scope, server);
  await a.read(); a.save(checkpoint('guided_practice')); await a.flush();
  const b = createStudyContinuityCloud(scope, server); const loaded = await b.read();
  assert.equal(loaded.checkpoint.phase, 'guided_practice');
  assert.ok(server.calls.every((call) => call.accountKey === scope.accountKey));
  a.dispose(); b.dispose();
});
test('competing devices cannot overwrite a newer checkpoint or undo a discard', async () => {
  const server = backend(); const a = createStudyContinuityCloud(scope, server); const b = createStudyContinuityCloud(scope, server);
  await a.read(); await b.read(); a.save(checkpoint()); await a.flush();
  b.save(checkpoint('guided_practice')); await b.flush(); assert.equal(b.getStatus(), 'conflict');
  a.clear(); await a.flush(); const calls = server.calls.length;
  b.save(checkpoint()); await b.flush(); assert.equal(server.calls.length, calls);
  const c = createStudyContinuityCloud(scope, server); const loaded = await c.read();
  assert.equal(loaded.cleared, true); assert.equal(loaded.checkpoint, null);
  a.dispose(); b.dispose(); c.dispose();
});
test('pending writes wait for the authenticated cloud revision', async () => {
  const server = backend(); const a = createStudyContinuityCloud(scope, server);
  a.save(checkpoint()); assert.equal(server.calls.length, 0);
  await a.read(); await a.flush(); assert.equal(server.calls[0].action, 'continuity-read');
  assert.equal(server.calls[1].revision, null); a.dispose();
});
test('serialization keeps a delayed save before a discard', async () => {
  const server = backend(); let release; let started;
  const began = new Promise((resolve) => { started = resolve; });
  const slow = new Promise((resolve) => { release = resolve; });
  const a = createStudyContinuityCloud(scope, { fetcher: async (url, init) => {
    if (JSON.parse(init.body).action === 'continuity-save') { started(); await slow; }
    return server.fetcher(url, init);
  } });
  await a.read(); a.save(checkpoint()); await began; a.clear(); release(); await a.flush();
  assert.equal(server.row.checkpoint, null); assert.equal(server.calls.at(-1).action, 'continuity-clear'); a.dispose();
});
test('malformed, wrong-scope, future and cached-grade fields cannot become cloud authority', async () => {
  const server = backend(); const a = createStudyContinuityCloud(scope, server); await a.read();
  a.save({ ...checkpoint(), sessionId: 'other' });
  a.save({ ...checkpoint(), savedAt: Date.now() + 99999 });
  assert.equal(server.calls.length, 1);
  a.save({ ...checkpoint(), conceptId: 'forged', conceptKey: 'forged', mastery: 1, verifiedAttemptId: 'forged', correct: true }); await a.flush();
  assert.equal(server.row.checkpoint.conceptKey, ''); assert.equal(server.row.checkpoint.conceptId, '');
  assert.equal('mastery' in server.row.checkpoint, false); assert.equal('verifiedAttemptId' in server.row.checkpoint, false); a.dispose();
});
test('bad responses and network failure stop cloud writes without retries', async () => {
  for (const fetcher of [async () => Response.json({}), async () => { throw new Error('offline'); }]) {
    let calls = 0; const a = createStudyContinuityCloud(scope, { fetcher: (...args) => { calls += 1; return fetcher(...args); } });
    assert.equal(await a.read(), null); a.save(checkpoint()); await a.flush();
    assert.equal(a.getStatus(), 'unavailable'); assert.equal(calls, 1); a.dispose();
  }
});
test('disposing during a read cancels the scope and never flushes queued writes', async () => {
  let finish; let calls = 0;
  const a = createStudyContinuityCloud(scope, { fetcher: async () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); } });
  const reading = a.read(); a.save(checkpoint()); a.dispose();
  finish(Response.json({ version, revision: null, checkpoint: null, cleared: false }));
  assert.equal(await reading, null); assert.equal(calls, 1);
});

test('cross-chat import reprojects only a matching topic and strips canonical authority', async () => {
  const { remapStudyContinuityCheckpoint, requestStudyContinuityImport, subscribeStudyContinuityImports } = await import('./study-continuity-cloud.js');
  const saved = { ...checkpoint('guided_practice'), mastery: 1, conceptKey: 'forged' };
  const imported = remapStudyContinuityCheckpoint(saved, { ...scope, sessionId: 'new-device-chat' });
  assert.equal(imported.sessionId, 'new-device-chat'); assert.equal(imported.conceptKey, ''); assert.equal('mastery' in imported, false);
  assert.equal(remapStudyContinuityCheckpoint(saved, { ...scope, topic: 'Biology' }), null);
  assert.equal(await requestStudyContinuityImport(saved), false);
  const off = subscribeStudyContinuityImports(async () => true);
  assert.equal(await requestStudyContinuityImport(saved), true); off();
});

test('a queued pre-hydration action cannot borrow a fresh revision to undo a cloud discard', async () => {
  let writes = 0;
  const driver = createStudyContinuityCloud({ sessionId: 'chat', topic: 'Motion graphs', accountKey: 'a@b.test' }, {
    fetcher: async (_url, init) => {
      if (JSON.parse(init.body).action !== 'continuity-read') writes++;
      return Response.json({ version, revision: '11111111-1111-4111-8111-111111111111', checkpoint: null, cleared: true });
    },
  });
  driver.clear();
  assert.equal((await driver.read()).cleared, true);
  await driver.flush();
  assert.equal(writes, 0); assert.equal(driver.getStatus(), 'conflict');
});
