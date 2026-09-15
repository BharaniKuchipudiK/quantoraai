import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDefaultProject, repairDefaultProjectStorage } from './project-store.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      values.set(key, String(value));
      writes.push([key, String(value)]);
    },
    writes,
  };
}

test('stored custom Projects are repaired with Personal Workspace before Studio initialises', () => {
  const key = 'quantora_projects_v1:account:user%40example.com';
  const custom = {
    id: 'project-sartho',
    version: 2,
    name: 'Sartho',
    description: 'Custom project',
    goal: 'Build Sartho',
    status: 'active',
    createdAt: 10,
    updatedAt: 20,
    color: '#3b82f6',
  };
  const storage = memoryStorage({ [key]: JSON.stringify([custom]) });

  assert.equal(repairDefaultProjectStorage(storage, 12345), 1);
  const projects = JSON.parse(storage.getItem(key));

  assert.equal(projects.length, 2);
  assert.deepEqual(projects[0], custom, 'existing custom Project must stay untouched');
  assert.deepEqual(projects[1], {
    id: 'project-personal',
    version: 0,
    name: 'Personal Workspace',
    description: 'Sessions you start outside a named Project show up here.',
    goal: '',
    status: 'active',
    createdAt: 12345,
    updatedAt: 12345,
    color: '#f97316',
  });
  assert.ok(projects.some((project) => project.id === 'project-personal'),
    'default-chat history must always have a matching project membership');
});

test('default workspace repair is idempotent', () => {
  const key = 'quantora_projects_v1:account:user';
  const projects = ensureDefaultProject([{ id: 'project-a', name: 'A' }], 100);
  const storage = memoryStorage({ [key]: JSON.stringify(projects) });

  assert.equal(repairDefaultProjectStorage(storage, 200), 0);
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(JSON.parse(storage.getItem(key)), projects);
});

test('corrupt project storage is left untouched for the hook fallback', () => {
  const key = 'quantora_projects_v1:account:user';
  const storage = memoryStorage({ [key]: '{not-json' });

  assert.equal(repairDefaultProjectStorage(storage, 300), 0);
  assert.equal(storage.getItem(key), '{not-json');
  assert.equal(storage.writes.length, 0);
});
