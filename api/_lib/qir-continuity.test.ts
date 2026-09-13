import test from 'node:test';
import assert from 'node:assert/strict';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from './qir-contracts.js';
import { assessQirContinuity, recoverOrphanedQirAction } from './qir-continuity.js';
import { runQirWorkerLoop, type QirDurableStorePort, type QirStepExecutor } from './qir-worker-runtime.js';

function activeRun(): QirAgentRun {
  const now = '2026-09-13T12:00:00.000Z';
  return {
    version: QIR_CONTRACT_VERSION,
    runId: 'continuity-run-001',
    goal: { statement: 'finish the durable task once', status: 'confirmed' },
    status: 'EXECUTING',
    steps: [{
      stepId: 'step-1',
      taskId: 'task-1',
      objective: 'perform one external side effect',
      dependsOn: [],
      status: 'active',
      requiresVerification: true,
      actionId: 'action-old-worker',
    }],
    cursor: { stepId: 'step-1', actionId: 'action-old-worker', attempt: 1 },
    artifacts: [],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: 100,
      stepUnitsRemaining: 40,
      recoveryReserveRemaining: 20,
      premiumEscalationRemaining: 5,
    },
    createdAt: now,
    updatedAt: now,
  };
}

test('replacement worker treats a persisted active action as orphaned', () => {
  const run = activeRun();
  const decision = assessQirContinuity(run, null);
  assert.equal(decision.action, 'recover');
  assert.equal(decision.orphanedActionId, 'action-old-worker');

  const recovered = recoverOrphanedQirAction(run, '2026-09-13T12:01:00.000Z');
  assert.equal(recovered.status, 'REPLANNING');
  assert.equal(recovered.cursor.actionId, null);
  assert.equal(recovered.cursor.attempt, 2);
  assert.equal(recovered.steps[0]?.status, 'failed_recoverable');
  assert.equal(recovered.steps[0]?.actionId, null);
});

test('the worker that claimed an active action may continue it', () => {
  const run = activeRun();
  const decision = assessQirContinuity(run, 'action-old-worker');
  assert.equal(decision.action, 'continue');
});

test('reclaimed worker recovers and reclaims before executor can run', async () => {
  let record = {
    run: activeRun(),
    storageVersion: 1,
    createdAt: '2026-09-13T12:00:00.000Z',
    updatedAt: '2026-09-13T12:00:00.000Z',
  };
  const eventTypes: string[] = [];
  let executions = 0;

  const store: QirDurableStorePort = {
    kind: 'memory',
    async readRun() { return record; },
    async commitEvent(input) {
      eventTypes.push(input.eventType);
      record = {
        run: input.run,
        storageVersion: record.storageVersion + 1,
        createdAt: record.createdAt,
        updatedAt: input.run.updatedAt,
      };
      return { status: 'committed', record };
    },
  };

  const executor: QirStepExecutor = {
    kind: 'proof',
    async execute(run, continuation) {
      executions += 1;
      return {
        observationId: `obs-${executions}`,
        runId: run.runId,
        actionId: continuation.actionId || 'missing',
        kind: 'runtime',
        status: 'success',
        evidence: [],
        observedAt: '2026-09-13T12:02:00.000Z',
      };
    },
  };

  await runQirWorkerLoop(store, executor, 'user-1', record.run.runId, { maxSteps: 2 });

  assert.equal(executions, 0, 'a replacement worker must not replay the orphaned action');
  assert.deepEqual(eventTypes, ['continuity.orphaned_action_recovered', 'step.claimed']);
  assert.equal(record.run.status, 'EXECUTING');
  assert.notEqual(record.run.cursor.actionId, 'action-old-worker');
  assert.ok(record.run.cursor.actionId);
});
