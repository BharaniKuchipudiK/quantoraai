import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStudyNotebookNote,
  deleteStudyNotebookNote,
  loadStudyNotebook,
  updateStudyNotebookNote,
} from './study-notebook-client.js';

test('Notebook client uses the authenticated server API for list/create/update/delete', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, credentials: init.credentials });
    if (init.method === 'GET') {
      return new Response(JSON.stringify({ notes: [{ id: 'n1', subject: 'Physics', title: 'Motion', body: '' }] }), { status: 200 });
    }
    if (init.method === 'POST') {
      return new Response(JSON.stringify({ note: { id: 'n2', ...JSON.parse(init.body) } }), { status: 201 });
    }
    if (init.method === 'PATCH') {
      return new Response(JSON.stringify({ note: JSON.parse(init.body) }), { status: 200 });
    }
    return new Response(JSON.stringify({ deleted: true }), { status: 200 });
  };

  try {
    const notes = await loadStudyNotebook();
    assert.equal(notes.length, 1);
    const created = await createStudyNotebookNote({ subject: 'Physics', topic: 'Motion', title: 'My note', body: 'Text' });
    assert.equal(created.id, 'n2');
    await updateStudyNotebookNote({ id: 'n2', subject: 'Physics', topic: 'Motion', title: 'Updated', body: 'Text 2' });
    await deleteStudyNotebookNote('n2');

    assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'PATCH', 'DELETE']);
    assert.ok(calls.every((call) => call.url === '/api/study-notebook'));
    assert.ok(calls.every((call) => call.credentials === 'include'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('Notebook client surfaces server errors without falling back to local persistence', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ error: 'Notebook storage unavailable.' }), { status: 503 });
  try {
    await assert.rejects(loadStudyNotebook(), /Notebook storage unavailable/);
  } finally {
    global.fetch = originalFetch;
  }
});
