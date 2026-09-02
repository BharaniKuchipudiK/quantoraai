import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { replayStudyLearnerProjection, type StudyLearnerProjection } from './study-learner-projection.js';
import {
  classifyStudyLearnerSnapshot,
  syncStudyLearnerSnapshot,
  type StoredStudyLearnerSnapshot,
} from './study-learner-snapshot-store.js';

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

function snapshotFrom(value: StudyLearnerProjection): StoredStudyLearnerSnapshot {
  return {
    schemaVersion: value.schemaVersion,
    learnerModelVersion: value.learnerModelVersion,
    estimatorVersion: value.estimatorVersion,
    conceptId: value.conceptId,
    observedThrough: value.observedThrough,
    projectedAt: value.projectedAt,
    projection: value,
  };
}

test('H3.2 snapshot classifier fails closed on version, ledger and projection drift', () => {
  const currentProjection = projection();
  assert.equal(classifyStudyLearnerSnapshot(null, currentProjection), 'missing');
  assert.equal(classifyStudyLearnerSnapshot(snapshotFrom(currentProjection), currentProjection), 'current');

  assert.equal(classifyStudyLearnerSnapshot({
    ...snapshotFrom(currentProjection),
    estimatorVersion: 'older-estimator',
  }, currentProjection), 'version_mismatch');

  assert.equal(classifyStudyLearnerSnapshot({
    ...snapshotFrom(currentProjection),
    observedThrough: '2026-09-01T00:00:00.000Z',
  }, { ...currentProjection, observedThrough: '2026-09-02T00:00:00.000Z' }), 'ledger_advanced');

  assert.equal(classifyStudyLearnerSnapshot({
    ...snapshotFrom(currentProjection),
    observedThrough: '2026-09-02T00:00:00.000Z',
  }, { ...currentProjection, observedThrough: '2026-09-01T00:00:00.000Z' }), 'snapshot_ahead');

  const changedProjection = {
    ...currentProjection,
    learnerModel: {
      ...currentProjection.learnerModel,
      nextLearningMove: {
        ...currentProjection.learnerModel.nextLearningMove,
        reasonCode: 'test_projection_change',
      },
    },
  } as StudyLearnerProjection;
  assert.equal(classifyStudyLearnerSnapshot(snapshotFrom(currentProjection), changedProjection), 'projection_changed');
});

test('H3.2 missing snapshot is saved through the monotonic RPC without raw evidence', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('study_learner_snapshots?')) return new Response('[]', { status: 200 });
    if (String(url).endsWith('/rest/v1/rpc/save_study_learner_snapshot')) return new Response('true', { status: 200 });
    return new Response('', { status: 500 });
  }) as typeof fetch;

  try {
    const result = await syncStudyLearnerSnapshot({ userSub: 'learner-h3-2', projection: projection() });
    assert.deepEqual(result, { status: 'saved', compatibility: 'missing' });
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /study_learner_snapshots/);
    assert.match(calls[1].url, /rpc\/save_study_learner_snapshot$/);
    const body = JSON.parse(String(calls[1].init?.body || '{}'));
    assert.equal(body.p_user_sub, 'learner-h3-2');
    assert.equal(body.p_projection.conceptId, CONCEPT_ID);
    assert.equal('evidence' in body.p_projection, false, 'snapshot must never contain the raw evidence ledger');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test('H3.2 migration keeps snapshots server-only and prevents cursor regression', async () => {
  const sql = await readFile('supabase/migrations/20260902014500_study_learner_projection_snapshots.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.study_learner_snapshots/i);
  assert.match(sql, /alter table public\.study_learner_snapshots enable row level security/i);
  assert.match(sql, /revoke all on public\.study_learner_snapshots from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant select, insert, update, delete on public\.study_learner_snapshots to service_role/i);
  assert.match(sql, /create or replace function public\.save_study_learner_snapshot/i);
  assert.match(sql, /excluded\.observed_through >= study_learner_snapshots\.observed_through/i);
  assert.match(sql, /revoke all on function public\.save_study_learner_snapshot[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.save_study_learner_snapshot[\s\S]*to service_role/i);
});
