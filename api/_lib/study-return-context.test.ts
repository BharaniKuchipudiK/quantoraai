import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStudyReturnContext } from './study-return-context.js';
const id = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-09-10T12:00:00Z');
test('empty account history performs no projection or model request', async () => {
  let count = 0;
  const result = await loadStudyReturnContext('owner', { now: () => now, readRows: async () => [],
    loadProjection: async () => { count++; throw new Error('must not run'); } });
  assert.equal(count, 0); assert.equal(result?.observedConcepts, 0); assert.equal(result?.coverage, 'complete');
});
test('discovery rows never substitute for the verified projection loader', async () => {
  const requests: any[] = [];
  const result = await loadStudyReturnContext('owner', { now: () => now,
    readRows: async (path: string) => path.startsWith('study_mastery_events')
      ? [{ concept_id: id, mastery: 1, correct: true }]
      : [{ id, canonical_key: 'motion.graphs', label: 'Motion graphs' }],
    loadProjection: async (input: any) => { requests.push(input); return null; },
  });
  assert.equal(result?.coverage, 'partial'); assert.equal(result?.recentMastery.length, 0);
  assert.deepEqual(requests[0], { userSub: 'owner', conceptId: id, conceptKey: 'motion.graphs', asOf: new Date(now).toISOString() });
});
test('unavailable discovery is not advertised as zero learner history', async () => {
  const result = await loadStudyReturnContext('owner', { now: () => now, readRows: async () => null, loadProjection: async () => null });
  assert.equal(result, null);
});
