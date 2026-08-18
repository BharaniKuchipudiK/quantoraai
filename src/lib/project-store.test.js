import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRemoteProjects, saveRemoteProject, syncRemoteProjectResources } from './project-store.js';

function withMockFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test('project client uses the shared pipeline-backed endpoint', async () => {
  let captured;
  await withMockFetch(async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ projects: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const result = await loadRemoteProjects();
    assert.deepEqual(result.projects, []);
  });

  assert.equal(captured.url, '/api/projects');
  assert.equal(captured.init.credentials, 'include');
  assert.equal(captured.body.targetStage, 'project-state');
  assert.equal(captured.body.action, 'list');
});

test('project save preserves optimistic version in the request', async () => {
  let captured;
  await withMockFetch(async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ project: { id: 'project-a', version: 4, name: 'A' } }), { status: 200 });
  }, async () => {
    await saveRemoteProject({ project: { id: 'project-a', name: 'A' }, expectedVersion: 3 });
  });
  assert.equal(captured.expectedVersion, 3);
  assert.equal(captured.project.id, 'project-a');
});

test('resource sync remains additive and project-scoped', async () => {
  let captured;
  await withMockFetch(async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ synced: true, count: 1 }), { status: 200 });
  }, async () => {
    await syncRemoteProjectResources('project-a', [{ kind: 'office', ref: 'f1', title: 'Deck' }]);
  });
  assert.equal(captured.action, 'sync-resources');
  assert.equal(captured.projectId, 'project-a');
  assert.equal(captured.resources.length, 1);
});
