import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  normalizeStudyScheduleBlockInput,
  normalizeStudyScheduleWindow,
  readStudyScheduleBlocks,
  STUDY_SCHEDULE_MAX_WINDOW_DAYS,
} from './study-schedule.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function withSupabaseEnv() {
  const prior = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'https://study-schedule.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  return () => {
    if (prior.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prior.url;
    if (prior.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prior.key;
  };
}

test('schedule input is bounded, typed, and keeps completion as planning state', () => {
  assert.deepEqual(normalizeStudyScheduleBlockInput({
    subject: '  Physics ',
    topic: ' Forces ',
    title: '  Newton practice ',
    startsAt: '2026-09-08T10:00:00+08:00',
    endsAt: '2026-09-08T11:00:00+08:00',
    kind: 'study',
    status: 'completed',
    notes: 'Review weak areas.',
  }), {
    subject: 'Physics',
    topic: 'Forces',
    title: 'Newton practice',
    startsAt: '2026-09-08T02:00:00.000Z',
    endsAt: '2026-09-08T03:00:00.000Z',
    kind: 'study',
    status: 'completed',
    notes: 'Review weak areas.',
  });

  assert.equal(normalizeStudyScheduleBlockInput({ subject: '', title: 'Study' }), null);
  assert.equal(normalizeStudyScheduleBlockInput({
    subject: 'Physics', title: 'Study', startsAt: 'bad', endsAt: '2026-09-08T03:00:00Z',
  }), null);
  assert.equal(normalizeStudyScheduleBlockInput({
    subject: 'Physics', title: 'Study', startsAt: '2026-09-08T02:00:00Z', endsAt: '2026-09-10T03:00:00Z',
  }), null);
  assert.equal(normalizeStudyScheduleBlockInput({
    subject: 'Physics', title: 'Study', startsAt: '2026-09-08T02:00:00Z', endsAt: '2026-09-08T03:00:00Z', kind: 'mastery',
  }), null);
});

test('schedule reads are constrained to a bounded learner-owned window', () => {
  assert.deepEqual(normalizeStudyScheduleWindow('2026-09-07T00:00:00Z', '2026-09-14T00:00:00Z'), {
    from: '2026-09-07T00:00:00.000Z',
    to: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(STUDY_SCHEDULE_MAX_WINDOW_DAYS, 31);
  assert.equal(normalizeStudyScheduleWindow('2026-09-14T00:00:00Z', '2026-09-07T00:00:00Z'), null);
  assert.equal(normalizeStudyScheduleWindow('2026-09-01T00:00:00Z', '2026-10-03T00:00:00Z'), null);
});

test('schedule list returns only public planning fields for the authenticated learner', async () => {
  const restoreEnv = withSupabaseEnv();
  const originalFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify([{
      id: '11111111-1111-4111-8111-111111111111',
      user_sub: 'must-not-return',
      subject: 'Physics',
      topic: 'Forces',
      title: 'Newton practice',
      starts_at: '2026-09-08T02:00:00.000Z',
      ends_at: '2026-09-08T03:00:00.000Z',
      kind: 'study',
      status: 'planned',
      notes: 'Review weak areas.',
      created_at: '2026-09-07T01:00:00.000Z',
      updated_at: '2026-09-07T01:00:00.000Z',
    }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const blocks = await readStudyScheduleBlocks(
      'learner:private',
      '2026-09-07T00:00:00.000Z',
      '2026-09-14T00:00:00.000Z',
    );
    assert.deepEqual(blocks, [{
      id: '11111111-1111-4111-8111-111111111111',
      subject: 'Physics',
      topic: 'Forces',
      title: 'Newton practice',
      startsAt: '2026-09-08T02:00:00.000Z',
      endsAt: '2026-09-08T03:00:00.000Z',
      kind: 'study',
      status: 'planned',
      notes: 'Review weak areas.',
      createdAt: '2026-09-07T01:00:00.000Z',
      updatedAt: '2026-09-07T01:00:00.000Z',
    }]);
    assert.match(requestedUrl, /study_schedule_blocks\?select=id,subject,topic,title,starts_at,ends_at,kind,status,notes,created_at,updated_at/);
    assert.match(requestedUrl, /user_sub=eq\.learner%3Aprivate/);
    assert.match(requestedUrl, /starts_at=lt\./);
    assert.match(requestedUrl, /ends_at=gt\./);
    assert.match(requestedUrl, /order=starts_at\.asc,id\.asc/);
    assert.equal(JSON.stringify(blocks).includes('must-not-return'), false);
    assert.doesNotMatch(requestedUrl, /study_mastery|study_assessment|correct_option/);
  } finally {
    global.fetch = originalFetch;
    restoreEnv();
  }
});

test('schedule migration is server-only and explicitly outside mastery truth', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260907011512_study_schedule_v1.sql'),
    'utf8',
  );
  assert.match(migration, /create table if not exists public\.study_schedule_blocks/);
  assert.match(migration, /alter table public\.study_schedule_blocks enable row level security/);
  assert.match(migration, /revoke all on public\.study_schedule_blocks from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.study_schedule_blocks to service_role/);
  assert.match(migration, /never verified mastery evidence/i);
  assert.doesNotMatch(migration, /study_mastery_events|study_mastery_estimates/);
});
