import assert from 'node:assert/strict';
import test from 'node:test';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from './qir-contracts.js';
import { stepQirRunOnce, heartbeatStepExecutor, type QirDurableStorePort } from './qir-worker-runtime.js';

function failedRun(): QirAgentRun {
  const now = '2026-09-12T00:00:00.000Z';
  return {
    version: QIR_CONTRACT_VERSION,
    runId: 'run-1',
    goal: { statement: 'repair', status: 'confirmed' },
    status: 'REPLANNING',
    steps: [{
      stepId: 'step-1', taskId: 'coding.model', objective: 'repair', dependsOn: [],
      status: 'failed_recoverable', requiresVerification: true, actionId: 'old-action',
    }],
    cursor: { stepId: 'step-1', actionId: 'old-action', attempt: 1 },
    artifacts: [], observations: [], verifications: [], checkpoints: [],
    budget: { runUnitsRemaining: 90, stepUnitsRemaining: 30, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: now, updatedAt: now,
  };
}

test('reclaiming a failed recoverable step commits a fresh action instead of replaying the failed action claim', async () => {
  let state = failedRun();
  let version = 2;
  const events: string[] = [];
  const store: QirDurableStorePort = {
    kind: 'memory',
    async readRun() { return { run: state, storageVersion: version, createdAt: state.createdAt, updatedAt: state.updatedAt }; },
    async commitEvent(input) {
      events.push(input.eventId);
      state = input.run;
      version += 1;
      return { status: 'committed', record: { run: state, storageVersion: version, createdAt: state.createdAt, updatedAt: state.updatedAt } };
    },
  };

  const result = await stepQirRunOnce(store, heartbeatStepExecutor(), 'u1', 'run-1');
  assert.equal(result.status, 'advanced');
  assert.notEqual(state.cursor.actionId, 'old-action');
  assert.match(String(state.cursor.actionId), /^step-1-action-2-/);
  assert.deepEqual(events, [`${state.cursor.actionId}-claim`]);
});
