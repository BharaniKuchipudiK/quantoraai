import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function storage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('[was-red] projects and chats are isolated by authenticated account without deleting either account', async () => {
  globalThis.localStorage = storage();
  const mod = await import(`./useStudioSession.js?account-isolation=${Math.random()}`);
  const api = mod.__testables;
  const projectA = { id: 'project-a', name: 'Account A private project', version: 1 };
  const sessionA = [{ id: 'session-a', projectId: 'project-a', messages: [{ sender: 'user', text: 'Account A private chat' }] }];
  api.persistProjects([projectA], 'account-a');
  api.persistSessions(sessionA, 'account-a');

  assert.deepEqual(api.loadProjects('account-b', false), []);
  assert.doesNotMatch(JSON.stringify(api.loadSessions({ text: 'new' }, 'account-b')), /Account A private chat/);
  assert.equal(api.loadProjects('account-a', false)[0].id, projectA.id);
  assert.equal(api.loadProjects('account-a', false)[0].name, projectA.name);
  assert.match(JSON.stringify(api.loadSessions({ text: 'new' }, 'account-a')), /Account A private chat/);
  assert.notEqual(api.scopedStorageKey('projects', 'account-a'), api.scopedStorageKey('projects', 'account-b'));
});

test('unowned legacy data is retained but never auto-loaded into an authenticated account', async () => {
  globalThis.localStorage = storage();
  globalThis.localStorage.setItem('quantora_projects_v1', JSON.stringify([{ id: 'legacy', name: 'Unknown owner' }]));
  globalThis.localStorage.setItem('quantora_chat_sessions', JSON.stringify([{ id: 'legacy-chat', messages: [{ text: 'Unknown private history' }] }]));
  const mod = await import(`./useStudioSession.js?legacy-isolation=${Math.random()}`);
  assert.deepEqual(mod.__testables.loadProjects('account-b', false), []);
  assert.doesNotMatch(JSON.stringify(mod.__testables.loadSessions({ text: 'new' }, 'account-b')), /Unknown private history/);
  assert.match(globalThis.localStorage.getItem('quantora_projects_v1'), /Unknown owner/);
  assert.match(globalThis.localStorage.getItem('quantora_chat_sessions'), /Unknown private history/);
});

test('switching authenticated accounts remounts the Studio before rendering another account', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<AiStudio\s+key=\{`studio-account-\$\{user\?\.sub \|\| user\?\.email \|\| 'signed-out'\}`\}/);
});

test('[was-red] PCL session scope reaches continuity and every production preview action', () => {
  const chat = readFileSync(new URL('./useChatStream.js', import.meta.url), 'utf8');
  const studio = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../components/LivePreviewCanvas.jsx', import.meta.url), 'utf8');

  assert.match(chat, /updatePclSessionOutcomeVersion\(sessionId, record\.version, undefined, storageScope\)/);
  assert.equal((studio.match(/storageScope=\{user\?\.sub \|\| user\?\.email \|\| null\}/g) || []).length, 2);
  assert.equal((preview.match(/readActivePclSessionId\(undefined, storageScope\)/g) || []).length, 4);
  assert.doesNotMatch(preview, /readActivePclSessionId\(\)/);
});
