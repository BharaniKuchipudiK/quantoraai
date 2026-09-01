import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  normalizeStudyNotebookNoteInput,
  readStudyNotebookNotes,
  STUDY_NOTEBOOK_MAX_NOTES,
} from './study-notebook.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function withSupabaseEnv() {
  const prior = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'https://study-notebook.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  return () => {
    if (prior.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prior.url;
    if (prior.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prior.key;
  };
}

test('notebook input keeps learner content bounded and requires subject/title', () => {
  assert.deepEqual(normalizeStudyNotebookNoteInput({
    subject: '  Physics  ',
    topic: '  Motion graphs ',
    title: '  Slope reminders  ',
    body: 'Velocity is the slope of displacement-time.\n',
  }), {
    subject: 'Physics',
    topic: 'Motion graphs',
    title: 'Slope reminders',
    body: 'Velocity is the slope of displacement-time.\n',
  });

  assert.equal(normalizeStudyNotebookNoteInput({ subject: '', title: 'Note' }), null);
  assert.equal(normalizeStudyNotebookNoteInput({ subject: 'Physics', title: '' }), null);
  assert.equal(normalizeStudyNotebookNoteInput(null), null);
});

test('notebook list reads only the authenticated learner projection and returns no ownership internals', async () => {
  const restoreEnv = withSupabaseEnv();
  const originalFetch = global.fetch;
  let requestedUrl = '';
  let requestedHeaders: HeadersInit | undefined;
  global.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestedHeaders = init?.headers;
    return new Response(JSON.stringify([{
      id: '11111111-1111-4111-8111-111111111111',
      subject: 'Physics',
      topic: 'Motion graphs',
      title: 'Slope reminders',
      body: 'Velocity is slope.',
      created_at: '2026-09-01T09:30:00.000Z',
      updated_at: '2026-09-01T09:31:00.000Z',
      user_sub: 'must-not-return',
    }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const notes = await readStudyNotebookNotes('learner:private');
    assert.deepEqual(notes, [{
      id: '11111111-1111-4111-8111-111111111111',
      subject: 'Physics',
      topic: 'Motion graphs',
      title: 'Slope reminders',
      body: 'Velocity is slope.',
      createdAt: '2026-09-01T09:30:00.000Z',
      updatedAt: '2026-09-01T09:31:00.000Z',
    }]);
    assert.equal(STUDY_NOTEBOOK_MAX_NOTES, 200);
    assert.match(requestedUrl, /study_notebook_notes\?select=id,subject,topic,title,body,created_at,updated_at/);
    assert.match(requestedUrl, /user_sub=eq\.learner%3Aprivate/);
    assert.match(requestedUrl, /order=updated_at\.desc,id\.desc/);
    assert.match(requestedUrl, /limit=200/);
    assert.doesNotMatch(requestedUrl, /study_mastery|correct_option|assessment/);
    assert.equal(JSON.stringify(notes).includes('must-not-return'), false);
    assert.ok(requestedHeaders);
  } finally {
    global.fetch = originalFetch;
    restoreEnv();
  }
});

test('notebook creation is bounded to the same reachable list capacity', () => {
  const source = fs.readFileSync(path.join(root, 'api/_lib/study-notebook.ts'), 'utf8');
  assert.match(source, /existing = await readStudyNotebookNotes\(userSub\)/);
  assert.match(source, /existing\.length >= STUDY_NOTEBOOK_MAX_NOTES/);
  assert.match(source, /status\(409\)/);
  assert.match(source, /Delete an older note before creating another/);
});

test('notebook migration is server-only and explicitly outside mastery truth', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260901093118_study_learner_notebook.sql'),
    'utf8',
  );
  assert.match(migration, /create table if not exists public\.study_notebook_notes/);
  assert.match(migration, /alter table public\.study_notebook_notes enable row level security/);
  assert.match(migration, /revoke all on public\.study_notebook_notes from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.study_notebook_notes to service_role/);
  assert.match(migration, /never admitted as verified mastery evidence/i);
  assert.doesNotMatch(migration, /study_mastery_events|study_mastery_estimates/);
});