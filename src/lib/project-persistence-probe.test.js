import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyProjectPersistence } from '../../scripts/lib/project-persistence-probe.mjs';

function store(mode) {
  let row;
  const calls = [];
  return { calls, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    assert.ok(init.signal);
    if (body.action === 'save') {
      if (mode === 'unavailable') return Response.json({}, { status: 503 });
      const next = { ...body.project, version: body.expectedVersion + 1 };
      if (mode !== 'phantom' && !(mode === 'stale' && row)) row = next;
      return Response.json({ project: next });
    }
    if (body.action === 'list') return Response.json({ projects: row ? [row] : [] });
    if (mode === 'cleanup-failed') return Response.json({}, { status: 503 });
    assert.equal(body.action, 'delete');
    assert.match(body.projectId, /^golden-project-/);
    assert.equal(body.projectId, calls[0].project.id);
    row = null;
    return Response.json({ deleted: true });
  } };
}

test('deployed golden must execute positive project persistence verification', () => {
  const gate = readFileSync(new URL('../../scripts/deployed-golden-transactions.mjs', import.meta.url), 'utf8');
  assert.match(gate, /evidence\.projectPersistence = await verifyProjectPersistence\(/);
});

test('project durability requires create, read, versioned update, read and scoped cleanup', async () => {
  const fixture = store();
  assert.deepEqual(await verifyProjectPersistence({ baseUrl: 'https://test.invalid', headers: {}, ...fixture }), { created: true, updated: true, readBack: true });
  assert.deepEqual(fixture.calls.map((call) => call.action), ['save', 'list', 'save', 'list', 'delete']);
});

for (const mode of ['phantom', 'stale', 'unavailable', 'cleanup-failed']) {
  test(`project durability rejects ${mode} persistence`, async () => {
    const fixture = store(mode);
    await assert.rejects(verifyProjectPersistence({ baseUrl: 'https://test.invalid', headers: {}, ...fixture }), /Project persistence/);
    assert.equal(fixture.calls.at(-1).action, 'delete');
    if (mode === 'unavailable') assert.deepEqual(fixture.calls.map((call) => call.action), ['save', 'delete']);
  });
}
