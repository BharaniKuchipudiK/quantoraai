import test from 'node:test';
import assert from 'node:assert/strict';
import { observeCodingDeliveryResult, runtimeStateForDeliveryStage } from './runtime-governor-delivery.js';
import type { RuntimeGovernorEvent } from './runtime-governor.js';

test('delivery stages map to execution, validation, recovery, and terminal completion', () => {
  assert.equal(runtimeStateForDeliveryStage('BUILD', true), 'executing');
  assert.equal(runtimeStateForDeliveryStage('VERIFY', true), 'validating');
  assert.equal(runtimeStateForDeliveryStage('CI', false), 'recovering');
  assert.equal(runtimeStateForDeliveryStage('DEPLOY', true), 'validating');
  assert.equal(runtimeStateForDeliveryStage('PRODUCTION_VERIFIED', true), 'completed');
});

test('successful repaired delivery produces one verified terminal outcome', async () => {
  const events: RuntimeGovernorEvent[] = [];
  await observeCodingDeliveryResult({
    userSub: 'user-delivery-governor',
    runId: 'qir-delivery-001',
    result: {
      ok: true,
      stage: 'PRODUCTION_VERIFIED',
      pullRequestNumber: 723,
      headSha: 'aaaaaaaaaaaa',
      mergeSha: 'bbbbbbbbbbbb',
      deploymentRef: 'dpl_governor_001',
      repairs: 1,
      evidence: [
        { stage: 'VERIFY', ok: true, detail: 'tests passed' },
        { stage: 'BUILD', ok: true, detail: 'pushed', ref: 'aaaaaaaaaaaa' },
        { stage: 'PR', ok: true, detail: 'opened', ref: '723' },
        { stage: 'CI', ok: false, detail: 'first CI failed', ref: 'aaaaaaaaaaaa' },
        { stage: 'VERIFY', ok: true, detail: 'repair verified' },
        { stage: 'BUILD', ok: true, detail: 'repair pushed', ref: 'cccccccccccc' },
        { stage: 'CI', ok: true, detail: 'CI passed', ref: 'cccccccccccc' },
        { stage: 'MERGE', ok: true, detail: 'merged', ref: 'bbbbbbbbbbbb' },
        { stage: 'DEPLOY', ok: true, detail: 'ready', ref: 'dpl_governor_001' },
        { stage: 'PRODUCTION_VERIFIED', ok: true, detail: 'healthy' },
      ],
      summary: 'production healthy',
    },
  }, async event => { events.push(event); });
  assert.equal(events.some(event => event.state === 'recovering'), true);
  assert.equal(events.at(-1)?.state, 'completed');
  assert.equal(events.at(-1)?.verified, true);
  assert.equal(events.at(-1)?.correlationId, 'delivery:qir-delivery-001');
});

test('failed delivery never produces verified completion', async () => {
  const events: RuntimeGovernorEvent[] = [];
  await observeCodingDeliveryResult({
    userSub: 'user-delivery-governor',
    runId: 'qir-delivery-002',
    result: {
      ok: false,
      stage: 'CI',
      repairs: 1,
      evidence: [
        { stage: 'VERIFY', ok: true, detail: 'verified' },
        { stage: 'CI', ok: false, detail: 'CI failed' },
        { stage: 'FAILED', ok: false, detail: 'repair exhausted' },
      ],
      summary: 'stopped at CI',
    },
  }, async event => { events.push(event); });
  assert.equal(events.at(-1)?.state, 'failed');
  assert.equal(events.at(-1)?.verified, false);
});
