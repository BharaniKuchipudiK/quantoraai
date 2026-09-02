import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { replayStudyLearnerProjection, type StudyLearnerProjection } from './study-learner-projection.js';
import { syncStudyLearnerSnapshot } from './study-learner-snapshot-store.js';

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

async function withSnapshotFetch(result: string, run: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>) {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(result), { status: 200 });
  }) as typeof fetch;

  try {
    await run(calls);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
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
