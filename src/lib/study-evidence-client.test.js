import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gradeStudyAssessment,
  requestStudyAssessment,
} from './study-evidence-client.js';

test('Study assessment issue sends only concept context and accepts a public item', async () => {
  const originalFetch = global.fetch;
  let sent;
  global.fetch = async (url, init) => {
    assert.equal(url, '/api/study-assessment');
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({
      attemptId: '11111111-1111-4111-8111-111111111111',
      item: { prompt: 'What does the slope represent?', options: [{ id: 'a', text: 'Velocity' }] },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await requestStudyAssessment({
      conceptId: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-1',
    });
    assert.equal(result.item.prompt, 'What does the slope represent?');
    assert.deepEqual(sent, {
      action: 'issue',
      conceptKey: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-1',
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Study assessment client exposes safe fallback metadata without counting a result', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    error: 'This topic is not mapped.',
    code: 'verified_assessment_unavailable',
    fallbackAllowed: true,
  }), { status: 422, headers: { 'Content-Type': 'application/json' } });
  try {
    await assert.rejects(
      requestStudyAssessment({ conceptId: 'unknown', conceptLabel: 'Unknown', sessionId: 'session-1' }),
      (error) => error.status === 422 && error.fallbackAllowed === true,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('Study assessment grade requires an explicit server-graded result', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    correct: true,
    evidenceKind: 'assessment_item',
    explanation: 'Verified explanation',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await gradeStudyAssessment({
      attemptId: '11111111-1111-4111-8111-111111111111',
      optionId: 'c',
    });
    assert.equal(result.correct, true);
  } finally {
    global.fetch = originalFetch;
  }
});
