import assert from 'node:assert/strict';
import test from 'node:test';
import { readVerifiedStudyMasteryEvidenceDelta } from './study-evidence-loader.js';

const CONCEPT_ID = '33333333-3333-4333-8333-333333333333';
const CONCEPT_KEY = 'physics.kinematics.motion-graphs';
const CURSOR_ID = '11111111-1111-4111-8111-111111111111';

async function withStudyStore(run: (calls: string[]) => Promise<void>) {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  const calls: string[] = [];
  try {
    await run(calls);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
}

function row(index: number) {
  return {
    id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    event_key: `context-${index}`,
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
    observed_at: '2026-08-01T00:00:00.000Z',
    created_at: new Date(Date.UTC(2026, 8, 2, 0, 0, index)).toISOString(),
  };
}

test('H3.3 delta query uses server append cursor, not semantic observedThrough', async () => {
  await withStudyStore(async (calls) => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify(calls.length === 1 ? [row(1)] : []), { status: 200 });
    }) as typeof fetch;

    const result = await readVerifiedStudyMasteryEvidenceDelta(
      'learner-h3-3',
      CONCEPT_ID,
      CONCEPT_KEY,
      { createdAt: '2026-09-01T00:00:00.000Z', id: CURSOR_ID },
    );

    assert.equal(result.status, 'complete');
    if (result.status !== 'complete') return;
    assert.equal(result.evidence.length, 1);
    assert.equal(result.cursor.id, row(1).id);
    assert.match(calls[0], /order=created_at\.asc%2Cid\.asc|order=created_at\.asc,id\.asc/);
    assert.match(decodeURIComponent(calls[0]), /created_at\.gt\.2026-09-01T00:00:00\.000Z/);
    assert.match(decodeURIComponent(calls[0]), new RegExp(`id\\.gt\\.${CURSOR_ID}`));
    assert.doesNotMatch(decodeURIComponent(calls[0]), /observed_at\.gt/);
  });
});

test('H3.3 oversized checkpoint delta requires full replay instead of truncation', async () => {
  await withStudyStore(async (calls) => {
    const source = Array.from({ length: 501 }, (_, index) => row(index + 1));
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get('offset') || 0);
      const limit = Number(parsed.searchParams.get('limit') || 0);
      return new Response(JSON.stringify(source.slice(offset, offset + limit)), { status: 200 });
    }) as typeof fetch;

    const result = await readVerifiedStudyMasteryEvidenceDelta(
      'learner-h3-3',
      CONCEPT_ID,
      CONCEPT_KEY,
      { createdAt: '2026-09-01T00:00:00.000Z', id: CURSOR_ID },
    );
    assert.deepEqual(result, {
      status: 'requires_full_replay',
      reasonCode: 'checkpoint_delta_overflow',
    });
    assert.equal(calls.length, 2, '500-row window plus one-row overflow probe');
  });
});
