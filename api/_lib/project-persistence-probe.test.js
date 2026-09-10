import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProjectPersistence } from '../../scripts/deployed-project-persistence.mjs';

const baseUrl = 'https://quantora-platform-fixture-sartho.vercel.app';
function transport(mode = '') {
  const calls = [];
  const rows = new Map();
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(url, `${baseUrl}/api/projects`);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    calls.push(body);
    if (body.action === 'list') return Response.json({ projects: [...rows.values()] });
    if (body.action === 'delete') {
      if (mode === 'cleanup-fails' || mode === 'both-fail') return Response.json({}, { status: 503 });
      rows.delete(body.projectId);
      return Response.json({ deleted: true });
    }
    const previous = rows.get(body.project.id);
    if (body.expectedVersion !== (previous?.version || 0)) {
      if (mode === 'timeout' || mode === 'both-fail') return Response.json({}, { status: 503 });
      if (mode === 'false-success') return Response.json({ project: body.project });
      if (mode === 'conflict-lies' && previous) rows.set(previous.id, { ...previous, goal: body.project.goal });
      return Response.json({ conflict: mode !== 'unclassified-conflict' }, { status: 409 });
    }
    const next = { ...body.project, version: (previous?.version || 0) + 1 };
    rows.set(next.id, next);
    if (mode === 'lost-create-response' && !previous) throw new Error('Create reply lost');
    if (mode === 'wrong-version') return Response.json({ project: { ...next, version: 99 } });
    if (mode === 'wrong-fields') rows.set(next.id, { ...next, goal: 'not the saved goal' });
    return Response.json({ project: next });
  };
  return { calls, rows, fetchImpl };
}

test('real API probe checks both conflicts, versioned saves, field readback and cleanup', async () => {
  const t = transport();
  const evidence = await verifyProjectPersistence({ baseUrl, headers: {}, fetchImpl: t.fetchImpl });
  for (const field of ['created', 'updated', 'readBack', 'missingConflict', 'staleConflict', 'preservedAfterConflict', 'cleanupConfirmed']) {
    assert.equal(evidence[field], true, field);
  }
  assert.equal(t.calls.length, 10, 'bounded sequence with no retries');
  assert.equal(t.rows.size, 0);
  const ids = t.calls.map((call) => call.project?.id || call.projectId).filter(Boolean);
  assert.equal(new Set(ids).size, 1);
  assert.match(ids[0], /^golden-project-[a-f0-9-]{36}$/);
  assert.notEqual(ids[0], 'project-personal');
});

for (const [mode, message] of [
  ['timeout', /expected HTTP 409, received 503/],
  ['false-success', /expected HTTP 409, received 200/],
  ['unclassified-conflict', /did not identify a conflict/],
  ['conflict-lies', /Saved fields\/version changed/],
  ['wrong-version', /version 1/],
  ['wrong-fields', /Saved fields\/version changed/],
  ['lost-create-response', /Create reply lost/],
  ['cleanup-fails', /expected HTTP 200, received 503/],
  ['both-fail', /expected HTTP 409, received 503; fixture cleanup also failed/],
]) {
  test(`probe rejects ${mode} without replaying a mutation or masking failure`, async () => {
    const t = transport(mode);
    await assert.rejects(verifyProjectPersistence({ baseUrl, headers: {}, fetchImpl: t.fetchImpl }), message);
    const saves = t.calls.filter((call) => call.action === 'save');
    assert.equal(new Set(saves.map((call) => JSON.stringify(call))).size, saves.length);
    assert.equal(t.calls.filter((call) => call.action === 'delete').length, 1);
    if (mode !== 'cleanup-fails' && mode !== 'both-fail') assert.equal(t.rows.size, 0);
  });
}

test('credentials are never sent to arbitrary URLs or redirected', async () => {
  for (const bad of ['http://quantora-platform-fixture-sartho.vercel.app',
    'https://example.com', 'https://quantora-platform-fixture-sartho.vercel.app.evil.com',
    `${baseUrl}/unexpected`, `${baseUrl}?token=oops`, 'https://user:pass@quantora-platform-fixture-sartho.vercel.app']) {
    let calls = 0;
    await assert.rejects(verifyProjectPersistence({ baseUrl: bad, headers: {}, fetchImpl: async () => { calls += 1; } }));
    assert.equal(calls, 0);
  }
});
