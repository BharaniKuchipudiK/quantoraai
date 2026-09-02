import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { replayStudyLearnerProjection, type StudyLearnerProjection } from './study-learner-projection.js';
import {
  readStudyLearnerCheckpoint,
  syncStudyLearnerCheckpoint,
  syncStudyLearnerSnapshot,
} from './study-learner-snapshot-store.js';
import { buildStudyReplayCheckpoint } from './study-replay-checkpoint.js';

const CONCEPT_ID = '33333333-3333-4333-8333-333333333333';
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';

function projection(asOf = '2026-09-02T00:00:00.000Z'): StudyLearnerProjection {
  return replayStudyLearnerProjection({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [],
    asOf,
  });
}

function checkpoint() {
  return buildStudyReplayCheckpoint({
    conceptId: CONCEPT_ID,
    conceptKey: CONCEPT_KEY,
    evidence: [],
    cursor: {
      createdAt: '2026-09-02T00:00:00.000Z',
      id: '44444444-4444-4444-8444-444444444444',
    },
  });
}

async function withStudyFetch(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
  run: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>,
) {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    calls.push({ url: target, init });
    return responder(target, init);
  }) as typeof fetch;

  try {
    await run(calls);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
}

async function withSnapshotFetch(result: string, run: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>) {
  return withStudyFetch(
    () => new Response(JSON.stringify(result), { status: 200 }),
    run,
  );
}

test('H3.2 snapshot sync is one monotonic RPC and never copies raw evidence', async () => {
  await withSnapshotFetch('saved', async (calls) => {
    const result = await syncStudyLearnerSnapshot({ userSub: 'learner-h3-2', projection: projection() });
    assert.deepEqual(result, { status: 'saved' });
    assert.equal(calls.length, 1, 'snapshot maintenance must stay one database round trip');
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/save_study_learner_snapshot$/);
    const body = JSON.parse(String(calls[0].init?.body || '{}'));
    assert.equal(body.p_user_sub, 'learner-h3-2');
    assert.equal(body.p_projection.conceptId, CONCEPT_ID);
    assert.equal('evidence' in body.p_projection, false, 'snapshot must never contain the raw evidence ledger');
  });
});

test('H3.2 accepts only bounded database sync statuses', async () => {
  for (const status of ['current', 'saved', 'snapshot_ahead'] as const) {
    await withSnapshotFetch(status, async () => {
      assert.deepEqual(
        await syncStudyLearnerSnapshot({ userSub: 'learner-h3-2', projection: projection() }),
        { status },
      );
    });
  }
  await withSnapshotFetch('unexpected_status', async () => {
    assert.deepEqual(
      await syncStudyLearnerSnapshot({ userSub: 'learner-h3-2', projection: projection() }),
      { status: 'unavailable' },
    );
  });
});

test('H3.3 checkpoint sync persists derived replay state and append cursor atomically', async () => {
  await withSnapshotFetch('saved', async (calls) => {
    const state = checkpoint();
    const result = await syncStudyLearnerCheckpoint({
      userSub: 'learner-h3-3',
      projection: projection(),
      checkpoint: state,
    });
    assert.deepEqual(result, { status: 'saved' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/save_study_learner_checkpoint$/);
    const body = JSON.parse(String(calls[0].init?.body || '{}'));
    assert.equal(body.p_append_cursor_created_at, state.cursor?.createdAt);
    assert.equal(body.p_append_cursor_id, state.cursor?.id);
    assert.equal(body.p_checkpoint.checkpointVersion, state.checkpointVersion);
    assert.equal('evidence' in body.p_checkpoint, false);
  });
});

test('H3.3 checkpoint read treats legacy rows as misses and normalizes a valid server cursor', async () => {
  await withStudyFetch(
    () => new Response(JSON.stringify([{ checkpoint: null }]), { status: 200 }),
    async () => {
      assert.deepEqual(
        await readStudyLearnerCheckpoint('learner-h3-3', CONCEPT_ID),
        { status: 'miss' },
      );
    },
  );

  const state = checkpoint();
  await withStudyFetch(
    () => new Response(JSON.stringify([{
      checkpoint_version: state.checkpointVersion,
      admission_version: state.admissionVersion,
      append_cursor_created_at: '2026-09-02T00:00:00+00:00',
      append_cursor_id: state.cursor?.id,
      checkpoint: state,
    }]), { status: 200 }),
    async () => {
      const result = await readStudyLearnerCheckpoint('learner-h3-3', CONCEPT_ID);
      assert.equal(result.status, 'hit');
      if (result.status !== 'hit') return;
      assert.equal(result.checkpoint.cursor?.createdAt, '2026-09-02T00:00:00.000Z');
      assert.equal(result.checkpoint.cursor?.id, state.cursor?.id);
    },
  );
});

test('H3.2 migration keeps snapshots server-only and resolves concurrency in the RPC', async () => {
  const sql = await readFile('supabase/migrations/20260902014500_study_learner_projection_snapshots.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.study_learner_snapshots/i);
  assert.match(sql, /alter table public\.study_learner_snapshots enable row level security/i);
  assert.match(sql, /revoke all on public\.study_learner_snapshots from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant select, insert, update on public\.study_learner_snapshots to service_role/i);
  assert.doesNotMatch(sql, /grant select, insert, update, delete on public\.study_learner_snapshots/i);
  assert.match(sql, /create or replace function public\.save_study_learner_snapshot/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /return 'snapshot_ahead';/i);
  assert.match(sql, /v_existing\.projection - 'projectedAt'/i);
  assert.match(sql, /excluded\.observed_through >= study_learner_snapshots\.observed_through/i);
  assert.match(sql, /revoke all on function public\.save_study_learner_snapshot[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.save_study_learner_snapshot[\s\S]*to service_role/i);
});

test('H3.3 migration keeps checkpoint state derived, bundled, monotonic, and server-only', async () => {
  const sql = await readFile('supabase/migrations/20260902043000_study_replay_checkpoints.sql', 'utf8');
  assert.match(sql, /add column if not exists checkpoint_version text/i);
  assert.match(sql, /add column if not exists admission_version text/i);
  assert.match(sql, /add column if not exists append_cursor_created_at timestamptz/i);
  assert.match(sql, /add column if not exists append_cursor_id uuid/i);
  assert.match(sql, /add column if not exists checkpoint jsonb/i);
  assert.match(sql, /study_learner_snapshots_checkpoint_bundle_check/i);
  assert.match(sql, /create or replace function public\.save_study_learner_checkpoint/i);
  assert.match(sql, /v_existing\.append_cursor_created_at > p_append_cursor_created_at/i);
  assert.match(sql, /v_existing\.append_cursor_id > p_append_cursor_id/i);
  assert.match(sql, /excluded\.append_cursor_id >= study_learner_snapshots\.append_cursor_id/i);
  assert.match(sql, /revoke all on function public\.save_study_learner_checkpoint[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.save_study_learner_checkpoint[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to anon|grant execute[\s\S]*to authenticated/i);
});
