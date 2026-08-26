import assert from 'node:assert/strict';
import test from 'node:test';
import { createStudyEvidenceEventKey } from './study-evidence-client.js';

test('Study evidence keys are bounded and safe for idempotent storage', () => {
  const key = createStudyEvidenceEventKey({
    sessionId: 'session/unsafe value',
    conceptId: 'session.Wave Optics',
  });
  assert.match(key, /^[a-z0-9][a-z0-9._:-]*$/);
  assert.ok(key.length <= 200);
  assert.match(key, /^study\.session-unsafe-value\.session\.wave-optics\./);
});
