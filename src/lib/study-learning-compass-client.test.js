import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStudyLearningCompass } from './study-learning-compass-client.js';

test('Learning Compass client calls the governed authenticated route with bounded context', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ status: 'ok', recommendations: [] }), { status: 200 });
  };

  try {
    const result = await loadStudyLearningCompass({
      conceptKey: 'session.motion',
      conceptLabel: 'Motion',
      curriculumKey: null,
      availableMinutes: 20,
    });
    assert.equal(result.status, 'ok');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/study-learning-compass');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.credentials, 'include');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      conceptKey: 'session.motion',
      conceptLabel: 'Motion',
      curriculumKey: null,
      availableMinutes: 20,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Learning Compass client preserves the governed availability response', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    error: 'This Study topic is not mapped to the reviewed concept graph yet.',
    status: 'unmapped',
  }), { status: 404 });

  try {
    await assert.rejects(
      loadStudyLearningCompass({ conceptKey: 'session.unknown', conceptLabel: 'Unknown' }),
      (error) => error.status === 404 && error.code === 'unmapped',
    );
  } finally {
    global.fetch = originalFetch;
  }
});
