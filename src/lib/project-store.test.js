import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadRemoteProjectContext,
  loadRemoteProjects,
  saveRemoteProject,
  syncRemoteProjectResources,
  syncRemoteProjectSessions,
} from './project-store.js';

function withMockFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test('[was-red] a rejected reconciliation save preserves the newer local project', async () => {
  // Exercise the hook's actual failure branch: its result is later persisted
  // back into localStorage, so selecting remote here destroys unsynced edits.
  const hook = readFileSync(new URL('../hooks/useStudioSession.js', import.meta.url), 'utf8');
  const start = hook.indexOf('if (timeValue(localProject.updatedAt) > timeValue(remote.updatedAt) + 1000)');
  assert.ok(start >= 0);
  const fallback = /\} catch \{([\s\S]*?)\n\s*\}/.exec(hook.slice(start))?.[1];
  assert.ok(fallback, 'the actual reconciliation fallback must remain covered');
  const retainAfterFailure = new Function('localProject', 'remote', `const reconciled = []; ${fallback}; return reconciled[0];`);
  const local = { id: 'project-a', name: 'My unsynced edits', version: 2, updatedAt: 20000 };
  const remote = { id: 'project-a', name: 'Older cloud copy', version: 2, updatedAt: 10000 };
  for (const status of [409, 503]) {
    await withMockFetch(async () => Response.json({ error: 'Save failed', conflict: status === 409 }, { status }), async () => {
      await assert.rejects(saveRemoteProject({ project: local, expectedVersion: remote.version }));
      assert.equal(retainAfterFailure(local, remote), local, `HTTP ${status} must not replace local edits with stale remote data`);
    });
  }
});

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

test('session membership sync is explicit and Project-scoped', async () => {
  let captured;
  await withMockFetch(async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ synced: true, count: 2 }), { status: 200 });
  }, async () => {
    await syncRemoteProjectSessions('project-a', ['session-1', 'session-2']);
  });
  assert.equal(captured.action, 'sync-sessions');
  assert.equal(captured.projectId, 'project-a');
  assert.deepEqual(captured.sessionIds, ['session-1', 'session-2']);
});

test('Project Outcome Graph context is loaded through the same endpoint', async () => {
  let captured;
  const expected = { projectId: 'project-a', decisions: ['Use option A'] };
  await withMockFetch(async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ context: expected }), { status: 200 });
  }, async () => {
    const result = await loadRemoteProjectContext('project-a');
    assert.deepEqual(result.context, expected);
  });
  assert.equal(captured.action, 'context');
  assert.equal(captured.projectId, 'project-a');
});
