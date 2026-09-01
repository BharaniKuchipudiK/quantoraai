import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudyTransferAttempt } from './study-transfer-intelligence.js';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function withTransferTarget(
  targetKey: string,
  run: () => Promise<void>,
  options: { usedItemRef?: string | null } = {},
) {
  const originalFetch = global.fetch;
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_concept_edges?')) {
      assert.match(target, /relation=eq\.supports_transfer_to/);
      return json([{ target_concept_id: TARGET_ID, confidence: 0.9 }]);
    }
    if (target.includes('/rest/v1/study_concepts?')) {
      return json([{ id: TARGET_ID, canonical_key: targetKey, label: 'Governed target' }]);
    }
    if (target.includes('/rest/v1/study_mastery_events?')) return json([]);
    if (target.includes('/rest/v1/study_assessment_attempts?select=id')) {
      const used = options.usedItemRef;
      if (used) {
        const separator = used.lastIndexOf('@');
        const key = used.slice(0, separator);
        const version = used.slice(separator + 1);
        if (target.includes(`item_key=eq.${key}`) && target.includes(`item_version=eq.${version}`)) {
          return json([{ id: '33333333-3333-4333-8333-333333333333' }]);
        }
      }
      return json([]);
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    await run();
  } finally {
    global.fetch = originalFetch;
  }
}

test('resolver refuses to call a reviewed representation item transfer', async () => {
  await withTransferTarget('physics.kinematics.motion-in-plane', async () => {
    const result = await resolveStudyTransferAttempt({
      userSub: 'learner-v7',
      sourceConcept: { id: SOURCE_ID, canonicalKey: 'physics.kinematics.motion-graphs', label: 'Motion graphs' },
    });
    assert.deepEqual(result, { status: 'none' });
  });
});

test('resolver can use an already-reviewed application item on a novel governed target', async () => {
  await withTransferTarget('math.vector.resultant', async () => {
    const result = await resolveStudyTransferAttempt({
      userSub: 'learner-v7',
      sourceConcept: { id: SOURCE_ID, canonicalKey: 'physics.kinematics.motion-graphs', label: 'Motion graphs' },
    });
    assert.equal(result.status, 'ready');
    if (result.status !== 'ready') return;
    assert.equal(result.plan.targetConcept.id, TARGET_ID);
    assert.equal(result.plan.item.key, 'vector-resultant-perpendicular');
    assert.equal(result.plan.item.cognitiveOperation, 'application');
  });
});

test('resolver refuses a globally used application item even when target concept has no local evidence', async () => {
  await withTransferTarget('math.vector.resultant', async () => {
    const result = await resolveStudyTransferAttempt({
      userSub: 'learner-v7',
      sourceConcept: { id: SOURCE_ID, canonicalKey: 'physics.kinematics.motion-graphs', label: 'Motion graphs' },
    });
    assert.deepEqual(result, { status: 'none' });
  }, { usedItemRef: 'vector-resultant-perpendicular@1' });
});
