import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./useStudioSession.js', import.meta.url), 'utf8');

// Run the complete production reconciliation, including its real local loader.
// Network/state setters are adapters; the decision logic is not copied here.
async function reconcile(local, remote, rejectSave = false) {
  const loaderStart = source.indexOf('function loadProjects(');
  const loaderEnd = source.indexOf('function persistProjects(', loaderStart);
  const reconcileStart = source.indexOf('const reconcile = async () => {');
  const reconcileEnd = source.indexOf('void reconcile();', reconcileStart);
  assert.ok(loaderStart >= 0 && loaderEnd > loaderStart && reconcileStart >= 0 && reconcileEnd > reconcileStart);
  const saves = [];
  let persisted;
  const run = new Function('localStorage', 'PROJECTS_STORAGE_KEY', 'normalizeLocalProject', 'createDefaultProject',
    'loadRemoteProjects', 'saveRemoteProject', 'persistProjects', 'sortProjects', 'timeValue', `
      const cancelled = false;
      const activeProjectId = 'project-personal';
      const setProjects = () => {};
      const setActiveProjectIdState = () => {};
      ${source.slice(loaderStart, loaderEnd)}
      ${source.slice(reconcileStart, reconcileEnd)}
      return reconcile();
    `);
  await run(
    { getItem: () => local === null ? null : JSON.stringify(local) }, 'projects', (value) => value,
    () => ({ id: 'project-personal', name: 'Personal Workspace', version: 0, updatedAt: 50000 }),
    async () => ({ projects: remote }),
    async (entry) => {
      saves.push(entry);
      if (rejectSave) throw new Error('Unavailable');
      return { project: { ...entry.project, version: entry.expectedVersion + 1 } };
    },
    (projects) => { persisted = projects; }, (projects) => projects, Number,
  );
  return { saves, persisted };
}

test('[was-red] a fresh browser reads the saved workspace without writing its generated default over it', async () => {
  const remote = [{ id: 'project-personal', name: 'My existing workspace', goal: 'Keep this goal', version: 7, updatedAt: 10000 }];
  for (const local of [null, []]) {
    const result = await reconcile(local, remote);
    assert.deepEqual(result.saves, [], 'a generated fallback is not a user edit');
    assert.deepEqual(result.persisted, remote);
  }
});

test('a genuinely new account still creates and persists its first workspace', async () => {
  const result = await reconcile(null, []);
  assert.equal(result.saves.length, 1);
  assert.equal(result.saves[0].expectedVersion, 0);
  assert.equal(result.persisted[0].version, 1);
});

test('stored unsynced edits still upload, and a rejected save preserves them', async () => {
  const local = [{ id: 'project-personal', name: 'My actual edit', version: 7, updatedAt: 30000 }];
  const remote = [{ id: 'project-personal', name: 'Old name', version: 7, updatedAt: 10000 }];
  for (const rejectSave of [false, true]) {
    const result = await reconcile(local, remote, rejectSave);
    assert.deepEqual(result.saves, [{ project: local[0], expectedVersion: 7 }]);
    assert.equal(result.persisted[0].name, 'My actual edit');
    assert.equal(result.persisted[0].version, rejectSave ? 7 : 8);
  }
});
