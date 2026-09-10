import test from 'node:test';
import assert from 'node:assert/strict';
import { studyContinuityCloudOperation } from './study-continuity-cloud.js';
import { makeStudyContinuityCheckpoint } from '../../src/lib/study-session-continuity.js';
const now = Date.parse('2026-09-10T12:00:00Z');
const revision = '11111111-1111-4111-8111-111111111111';
const checkpoint = makeStudyContinuityCheckpoint({ sessionId: 'chat', now,
  mission: { label: 'Motion graphs', phase: 'guided_practice', status: 'active', source: 'compass', topicAligned: true } });
const body = { sessionId: 'chat', topic: 'Motion graphs', revision: null, checkpoint };
function dependencies(rows: any[] | null = []) {
  const paths: string[] = []; const writes: any[] = [];
  return { paths, writes, now: () => now,
    readRows: async (path: string) => { paths.push(path); return rows; },
    request: async (path: string, init: RequestInit) => {
      paths.push(path); writes.push(JSON.parse(String(init.body)));
      return Response.json({ outcome: 'saved', revision });
    },
  };
}
test('cloud read uses authenticated subject, never browser user identifiers', async () => {
  const deps = dependencies([{ checkpoint, revision, expires_at: '2026-09-11T00:00:00Z' }]);
  const result = await studyContinuityCloudOperation('owner:real', { ...body, action: 'continuity-read', userSub: 'victim' }, deps);
  assert.equal(result.status, 200); assert.match(deps.paths[0], /user_sub=eq.owner%3Areal/);
  assert.doesNotMatch(deps.paths[0], /victim/); assert.equal(result.body.checkpoint.phase, 'guided_practice');
});
test('cloud writes reproject allowed UI fields and attribute the authenticated user', async () => {
  const deps = dependencies();
  const result = await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-save',
    checkpoint: { ...checkpoint, conceptKey: 'forged', mastery: 1, correct: true, attemptId: 'fake' } }, deps);
  assert.equal(result.status, 200); assert.equal(deps.writes[0].p_user_sub, 'owner');
  assert.equal(deps.writes[0].p_checkpoint.conceptKey, ''); assert.equal('mastery' in deps.writes[0].p_checkpoint, false);
  assert.equal('attemptId' in deps.writes[0].p_checkpoint, false);
});
test('invalid revision, oversized input and future checkpoint are rejected before a write', async () => {
  for (const change of [{ revision: 'not-a-revision' }, { checkpoint: { ...checkpoint, padding: 'x'.repeat(3000) } },
    { checkpoint: { ...checkpoint, savedAt: now + 1 } }, { sessionId: 'other-chat' }]) {
    const deps = dependencies(); const result = await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-save', ...change }, deps);
    assert.equal(result.status, 400); assert.equal(deps.writes.length, 0);
  }
});
test('a concurrent write reports conflict rather than false saved success', async () => {
  const deps = { ...dependencies(), request: async () => Response.json({ outcome: 'conflict' }) };
  assert.equal((await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-save' }, deps)).status, 409);
});
test('discarding a different topic does not erase that cloud checkpoint', async () => {
  const deps = dependencies([{ checkpoint: { ...checkpoint, label: 'Biology' } }]);
  assert.equal((await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-clear', revision }, deps)).status, 409);
  assert.equal(deps.writes.length, 0);
});
test('discard writes a revisioned tombstone and expired reads suppress local resurrection', async () => {
  const deps = dependencies([{ checkpoint }]);
  assert.equal((await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-clear', revision }, deps)).status, 200);
  assert.equal(deps.writes[0].p_checkpoint, null); assert.equal(deps.writes[0].p_expected_revision, revision);
  const result = await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-read' },
    dependencies([{ checkpoint, revision, expires_at: '2026-09-09T00:00:00Z' }]));
  assert.equal(result.body.cleared, true); assert.equal(result.body.checkpoint, null);
});
test('account-wide cloud list admits only matching topics and never exposes another user selector', async () => {
  const deps = dependencies([{ session_id: 'chat', checkpoint }, { session_id: 'wrong', checkpoint: { ...checkpoint, label: 'Biology', sessionId: 'wrong' } }]);
  const result = await studyContinuityCloudOperation('owner', { action: 'continuity-list', topic: body.topic }, deps);
  assert.equal(result.status, 200); assert.equal(result.body.checkpoints.length, 1);
  assert.match(deps.paths[0], /user_sub=eq.owner/);
});
test('database unavailability is not empty history or successful saving', async () => {
  assert.equal((await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-read' }, dependencies(null))).status, 503);
  const deps = { ...dependencies(), request: async () => null };
  assert.equal((await studyContinuityCloudOperation('owner', { ...body, action: 'continuity-save' }, deps)).status, 503);
});
