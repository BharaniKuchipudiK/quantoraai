import assert from 'node:assert/strict';
import test from 'node:test';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from '../../api/_lib/qir-contracts.js';
import { attachQirWorkingContext, compactQirWorkingContext } from '../../api/_lib/qir-context-state.js';
import {
  AUTO_DELIVERY_CONTEXT_KEY,
  autoDeliveryAlreadyScheduled,
  deriveAutoDeliveryInput,
  isVerifiedAutoDeliveryCandidate,
} from './auto-delivery-invocation.js';

function completedRun(marker?: Record<string, unknown>): QirAgentRun {
  const now = '2026-09-13T12:00:00.000Z';
  const run: QirAgentRun = {
    version: QIR_CONTRACT_VERSION,
    runId: 'run-auto-deliver-1',
    goal: { statement: 'Ship the verified change', status: 'achieved' },
    status: 'COMPLETE',
    steps: [{
      stepId: 'coding', taskId: 'coding.model', objective: 'Ship the verified change',
      dependsOn: [], status: 'succeeded', requiresVerification: true, actionId: 'action-1',
    }],
    cursor: { stepId: 'coding', actionId: 'action-1', attempt: 1 },
    artifacts: [{
      artifactId: 'coding-desk-vfs', generation: 1, ref: 'workspace:test', state: 'verified',
      createdByActionId: 'action-1', verifiedByActionId: 'verify-1',
    }],
    observations: [],
    verifications: [{
      verificationId: 'verify-1', runId: 'run-auto-deliver-1', actionId: 'verifier-1',
      passed: true, proofOfDoneStatus: 'verified', evidenceRefs: ['build:passed'], verifiedAt: now,
    }],
    checkpoints: [{
      checkpointId: 'checkpoint-1', runId: 'run-auto-deliver-1', stepId: 'coding', actionId: 'action-1',
      artifactGenerations: { 'coding-desk-vfs': 1 }, createdAt: now,
    }],
    budget: { runUnitsRemaining: 90, stepUnitsRemaining: 30, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: now,
    updatedAt: now,
  };
  return attachQirWorkingContext(run, compactQirWorkingContext({
    run,
    projectState: { executionOwner: 'server', ...(marker ? { [AUTO_DELIVERY_CONTEXT_KEY]: marker } : {}) },
    compactedAt: now,
  }));
}

const env = {
  QIR_DELIVERY_PILOT_REPO: 'acme/widget',
  QIR_DELIVERY_PILOT_VERCEL_PROJECT: 'widget-web',
  QIR_DELIVERY_PILOT_BASE_BRANCH: 'main',
} as NodeJS.ProcessEnv;

test('only verified completed runs are eligible for automatic delivery', () => {
  const run = completedRun();
  assert.equal(isVerifiedAutoDeliveryCandidate(run), true);
  assert.equal(isVerifiedAutoDeliveryCandidate({ ...run, status: 'VERIFYING' }), false);
  assert.equal(isVerifiedAutoDeliveryCandidate({ ...run, goal: { ...run.goal, status: 'confirmed' } }), false);
  assert.equal(isVerifiedAutoDeliveryCandidate({ ...run, verifications: [] }), false);
  assert.equal(isVerifiedAutoDeliveryCandidate({ ...run, checkpoints: [] }), false);
  assert.equal(isVerifiedAutoDeliveryCandidate({ ...run, artifacts: run.artifacts.map(item => ({ ...item, state: 'candidate' as const })) }), false);
});

test('delivery input is derived only from the operator-pinned target', () => {
  const input = deriveAutoDeliveryInput('user-1', completedRun(), env);
  assert.ok(input);
  assert.equal(input.owner, 'acme');
  assert.equal(input.repo, 'widget');
  assert.equal(input.vercelProject, 'widget-web');
  assert.equal(input.baseBranch, 'main');
  assert.match(input.branch, /^quantora\/auto-run-auto-deliver-1-[a-f0-9]{10}$/);
  assert.equal(deriveAutoDeliveryInput('user-1', completedRun(), {} as NodeJS.ProcessEnv), null);
});

test('a durable scheduled marker suppresses duplicate invocation', () => {
  const run = completedRun({ state: 'scheduled', scheduledAt: '2026-09-13T12:01:00.000Z' });
  assert.equal(autoDeliveryAlreadyScheduled(run), true);
  assert.equal(isVerifiedAutoDeliveryCandidate(run), false);
  assert.equal(deriveAutoDeliveryInput('user-1', run, env), null);
});
