import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStudyAssessmentHistory } from './study-assessment-history-client.js';

test('history client performs an authenticated read and preserves learner-safe rows', async () => {
  const originalFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      windowDays: 30,
      generatedAt: '2026-09-01T09:00:00.000Z',
      assessments: [{
        submittedAt: '2026-09-01T08:00:00.000Z',
        subject: 'physics',
        concept: { key: 'physics.motion', label: 'Motion' },
        evidenceKind: 'assessment_item',
        assessmentType: 'Assessment',
        scorePercent: 100,
        correct: true,
        difficulty: 0.5,
        evidenceFor: null,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await loadStudyAssessmentHistory();
    assert.equal(captured.url, '/api/study-assessment-history');
    assert.equal(captured.init.method, 'GET');
    assert.equal(captured.init.credentials, 'include');
    assert.equal(result.windowDays, 30);
    assert.equal(result.assessments[0].concept.label, 'Motion');
  } finally {
    global.fetch = originalFetch;
  }
});

test('history client surfaces server errors without manufacturing data', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    error: 'Assessment history is temporarily unavailable.',
  }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      loadStudyAssessmentHistory(),
      /Assessment history is temporarily unavailable/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
