import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from './session.js';
import studyAssessmentHandler, { normalizeStudyAssessmentRequest } from './study-assessment.js';

process.env.SESSION_SECRET = '12345678901234567890123456789012';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

const CONCEPT_ID = '22222222-2222-4222-8222-222222222222';

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

function authenticatedRequest(body: any) {
  const token = createSessionToken({ sub: 'learner-session', email: 'session@example.com', name: 'Learner', picture: '' });
  return { method: 'POST', headers: { cookie: `quantora_session=${token}` }, socket: {}, body };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

test('assessment session exclusions are bounded, validated, and deduplicated', () => {
  assert.deepEqual(normalizeStudyAssessmentRequest({
    action: 'issue',
    conceptKey: 'Physics.Kinematics.Motion-Graphs',
    conceptLabel: 'Motion graphs',
    sessionId: 'session-batch',
    excludeItemRefs: ['motion-graphs-velocity-slope@1', 'motion-graphs-velocity-slope@1'],
  }), {
    action: 'issue',
    conceptKey: 'physics.kinematics.motion-graphs',
    conceptLabel: 'Motion graphs',
    sessionId: 'session-batch',
    excludeItemRefs: ['motion-graphs-velocity-slope@1'],
  });

  assert.equal(normalizeStudyAssessmentRequest({
    action: 'issue', conceptKey: 'physics.kinematics.motion-graphs', conceptLabel: 'Motion graphs', sessionId: 'session-batch',
    excludeItemRefs: ['../unsafe@1'],
  }), null);

  assert.equal(normalizeStudyAssessmentRequest({
    action: 'issue', conceptKey: 'physics.kinematics.motion-graphs', conceptLabel: 'Motion graphs', sessionId: 'session-batch',
    excludeItemRefs: Array.from({ length: 21 }, (_, index) => `item-${index}@1`),
  }), null);
});

test('session-local exclusions can reserve a distinct reviewed item without exposing an answer key', async () => {
  const originalFetch = global.fetch;
  let storedAttempt: any = null;
  global.fetch = async (url: any, init: any = {}) => {
    const target = String(url);
    if (target.includes('/rest/v1/users?select=')) return json([{ google_sub: 'learner-session', email: 'session@example.com', blocked_at: null }]);
    if (target.includes('/rest/v1/study_concepts?') && target.includes('canonical_key=eq.physics.kinematics.motion-graphs')) {
      return json([{ id: CONCEPT_ID, canonical_key: 'physics.kinematics.motion-graphs', label: 'Motion graphs' }]);
    }
    if (target.includes('/rest/v1/study_mastery_events?')) return json([]);
    if (target.includes('/rest/v1/study_assessment_attempts?select=item_key,item_version')) return json([]);
    if (target.endsWith('/rest/v1/study_assessment_attempts') && init.method === 'POST') {
      storedAttempt = JSON.parse(init.body)[0];
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const { state, res } = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({
      action: 'issue',
      conceptKey: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-batch',
      excludeItemRefs: ['motion-graphs-velocity-slope@1'],
    }), res);

    assert.equal(state.status, 201);
    assert.equal(storedAttempt.item_key, 'motion-graphs-acceleration-slope');
    assert.equal(state.body.item.itemKey, 'motion-graphs-acceleration-slope');
    assert.equal('correctOptionId' in state.body.item, false);
    assert.equal('explanation' in state.body.item, false);
  } finally {
    global.fetch = originalFetch;
  }
});
