import assert from 'node:assert/strict';
import test from 'node:test';
import studyEvidenceHandler, { normalizeStudySelfConfidenceRequest } from './study-evidence.js';

process.env.SESSION_SECRET = '12345678901234567890123456789012';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

function responseHarness() {
  const state: { status?: number; body?: any; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader(name: string, value: string) { state.headers[name] = value; },
    status(code: number) { state.status = code; return this; },
    json(body: any) { state.body = body; return this; },
    end() { return this; },
  };
  return { state, res };
}

test('Study evidence accepts bounded self-confidence without accepting mastery fields', () => {
  const event = normalizeStudySelfConfidenceRequest({
    eventKey: 'Study.Session-1.Wave-Optics.1',
    conceptKey: 'session.wave-optics',
    conceptLabel: 'Wave optics',
    sessionId: 'session-1',
    kind: 'self_confidence',
    selfConfidence: 0.75,
    correct: true,
    score: 1,
  });
  assert.deepEqual(event, {
    eventKey: 'study.session-1.wave-optics.1',
    conceptKey: 'session.wave-optics',
    conceptLabel: 'Wave optics',
    sessionId: 'session-1',
    selfConfidence: 0.75,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'correct'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'score'), false);
});

test('Study evidence rejects forged assessment kinds and malformed identifiers', () => {
  assert.equal(normalizeStudySelfConfidenceRequest({
    eventKey: 'event-1', conceptKey: 'session.topic', conceptLabel: 'Topic', sessionId: 'session-1',
    kind: 'assessment_item', selfConfidence: 1,
  }), null);
  assert.equal(normalizeStudySelfConfidenceRequest({
    eventKey: '../event', conceptKey: 'session.topic', conceptLabel: 'Topic', sessionId: 'session-1',
    kind: 'self_confidence', selfConfidence: 1,
  }), null);
  assert.equal(normalizeStudySelfConfidenceRequest({
    eventKey: 'event-1', conceptKey: 'session.topic', conceptLabel: 'Topic', sessionId: 'session-1',
    kind: 'self_confidence', selfConfidence: 2,
  }), null);
});

test('authenticated Study self-confidence is appended without a score or correct answer', async () => {
  const originalFetch = global.fetch;
  let inserted: any = null;
  global.fetch = async (url: any, init: any = {}) => {
    const path = String(url);
    if (path.includes('/rest/v1/users?select=')) {
      return new Response(JSON.stringify([{
        google_sub: 'user-1', email: 'learner@example.com', blocked_at: null,
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path.includes('/rest/v1/study_concepts?select=id&canonical_key=')) {
      return new Response(JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111' }]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.endsWith('/rest/v1/study_mastery_events') && init.method === 'POST') {
      inserted = JSON.parse(String(init.body))[0];
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${path}`);
  };

  try {
    const { createSessionToken } = await import('./session.js');
    const token = createSessionToken({
      sub: 'user-1', email: 'learner@example.com', name: 'Learner', picture: '',
    });
    const { state, res } = responseHarness();
    await studyEvidenceHandler({
      method: 'POST',
      headers: { cookie: `quantora_session=${token}` },
      body: {
        eventKey: 'study.session-1.wave-optics.event-1',
        conceptKey: 'physics.kinematics.motion-graphs',
        conceptLabel: 'Motion graphs',
        sessionId: 'session-1',
        kind: 'self_confidence',
        selfConfidence: 0.8,
      },
    }, res);
    assert.equal(state.status, 201);
    assert.equal(state.body?.masteryChanged, false);
    assert.equal(inserted.event_kind, 'self_confidence');
    assert.equal(inserted.self_confidence, 0.8);
    assert.equal(inserted.correct, null);
    assert.equal(inserted.score, null);
  } finally {
    global.fetch = originalFetch;
  }
});
