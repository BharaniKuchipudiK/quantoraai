import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readVerifiedStudyMasteryEvidence } from './study-evidence-loader.js';
import { readStudySupabaseRowsPaged } from './study-supabase.js';

function withStudyStore(run: () => Promise<void>) {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  return run().finally(() => {
    if (oldUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
}

function offsetAndLimit(url: string) {
  const parsed = new URL(url);
  return {
    offset: Number(parsed.searchParams.get('offset') || 0),
    limit: Number(parsed.searchParams.get('limit') || 0),
  };
}

test('H3.3 paged Study reads return complete history beyond the former 500-row ceiling', async () => {
  await withStudyStore(async () => {
    const oldFetch = globalThis.fetch;
    const source = Array.from({ length: 501 }, (_, index) => ({ index }));
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const { offset, limit } = offsetAndLimit(url);
      return new Response(JSON.stringify(source.slice(offset, offset + limit)), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await readStudySupabaseRowsPaged(
        'study_mastery_events?select=id&order=created_at.asc,id.asc',
        { operation: 'h3_3_paging_test', pageSize: 250, maxRows: 1_000 },
      );
      assert.equal(result?.status, 'complete');
      assert.equal(result?.rows.length, 501);
      assert.equal(result?.pages, 3);
      assert.equal(calls.length, 3);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

test('H3.3 bounded full replay fails closed instead of returning a truncated prefix', async () => {
  await withStudyStore(async () => {
    const oldFetch = globalThis.fetch;
    const source = Array.from({ length: 6 }, (_, index) => ({ index }));
    globalThis.fetch = (async (input: string | URL | Request) => {
      const { offset, limit } = offsetAndLimit(String(input));
      return new Response(JSON.stringify(source.slice(offset, offset + limit)), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await readStudySupabaseRowsPaged(
        'study_mastery_events?select=id&order=created_at.asc,id.asc',
        { operation: 'h3_3_overflow_test', pageSize: 2, maxRows: 5 },
      );
      assert.equal(result?.status, 'overflow');
      assert.equal(result?.rows.length, 5);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

test('H3.3 verified evidence loader replays 501 non-assessment rows without truncation', async () => {
  await withStudyStore(async () => {
    const oldFetch = globalThis.fetch;
    const source = Array.from({ length: 501 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      event_key: `self-confidence-${index}`,
      event_kind: 'self_confidence',
      correct: null,
      score: null,
      difficulty: null,
      hints_used: 0,
      response_ms: null,
      self_confidence: 0.5,
      independent: true,
      misconception_signal: false,
      delay_days: null,
      provenance: 'connected_source',
      source_ref: 'quantora:test',
      assessment_ref: null,
      item_ref: null,
      observed_at: new Date(Date.UTC(2026, 0, 1, 0, index % 60, 0)).toISOString(),
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      assert.match(url, /study_mastery_events/);
      const { offset, limit } = offsetAndLimit(url);
      return new Response(JSON.stringify(source.slice(offset, offset + limit)), { status: 200 });
    }) as typeof fetch;
    try {
      const events = await readVerifiedStudyMasteryEvidence(
        'learner-h3-3',
        '33333333-3333-4333-8333-333333333333',
        'physics.kinematics.motion-graphs',
      );
      assert.equal(events?.length, 501);
      assert.equal(calls.length, 3);
      assert.equal(events?.[500]?.id, 'self-confidence-500');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

test('H3.3 verified loader no longer contains a silent 500-row replay limit', async () => {
  const source = await readFile('api/_lib/study-evidence-loader.ts', 'utf8');
  assert.doesNotMatch(source, /study_mastery_events[^\n]*limit=500/);
  assert.doesNotMatch(source, /study_assessment_attempts[^\n]*limit=500/);
  assert.match(source, /readStudySupabaseRowsPaged/);
  assert.match(source, /status === 'overflow'/);
});
