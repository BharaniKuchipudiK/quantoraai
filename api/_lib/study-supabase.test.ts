import assert from 'node:assert/strict';
import test from 'node:test';
import { studySupabaseRequest } from './study-supabase.js';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

test('Study Supabase transport never logs learner-scoped paths or raw exception messages', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  global.fetch = async () => {
    const error = new Error('network failed for learner-sensitive-value');
    error.name = 'AbortError';
    throw error;
  };
  console.warn = (...args: unknown[]) => { warnings.push(args); };

  try {
    const path = 'study_assessment_attempts?user_sub=eq.learner-sensitive-value&item_key=eq.private-item';
    const response = await studySupabaseRequest(path, { method: 'GET' }, { operation: 'assessment_item_freshness' });
    assert.equal(response, null);
    assert.equal(warnings.length, 1);
    const serialized = JSON.stringify(warnings[0]);
    assert.match(serialized, /assessment_item_freshness/);
    assert.match(serialized, /AbortError/);
    assert.doesNotMatch(serialized, /learner-sensitive-value/);
    assert.doesNotMatch(serialized, /private-item/);
    assert.doesNotMatch(serialized, /network failed/);
    assert.doesNotMatch(serialized, /SUPABASE_SERVICE_ROLE_KEY|service-role-test-key/);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
