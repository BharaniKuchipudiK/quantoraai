import assert from 'node:assert/strict';
import test from 'node:test';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from './qir-contracts.js';
import { createQirServerCodingExecutor } from './qir-server-coding-executor.js';
import { qirProviderFailure } from './qir-provider-failure.js';

function activeRun(): QirAgentRun {
  const now = '2026-09-12T00:00:00.000Z';
  return {
    version: QIR_CONTRACT_VERSION,
    runId: 'run-1',
    goal: { statement: 'Change the heading from Old to New', status: 'confirmed' },
    status: 'EXECUTING',
    steps: [{
      stepId: 'step-1', taskId: 'coding.model', objective: 'Change the heading from Old to New', dependsOn: [],
      status: 'active', requiresVerification: true, actionId: 'action-1',
    }],
    cursor: { stepId: 'step-1', actionId: 'action-1', attempt: 0 },
    artifacts: [], observations: [], verifications: [], checkpoints: [],
    budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: now, updatedAt: now,
  };
}

const continuation = { stepId: 'step-1', taskId: 'coding.model', actionId: 'action-1' };

test('server Coding executor loads durable source, calls a model, saves source and independently completes the Run', async () => {
  let prompt = '';
  let savedVfs: any = null;
  const executor = createQirServerCodingExecutor({
    modelId: 'test/model',
    loadWorkspace: async () => ({
      status: 'loaded', sessionId: 'desk-1', checkpointCount: 1,
      vfs: { 'index.html': '<!doctype html><html><body><main><h1>Old</h1></main></body></html>' },
    }),
    modelRunner: async (input) => {
      prompt = input.prompt;
      return {
        status: 'success', provider: 'openrouter', modelId: 'test/model',
        text: '```html filepath="index.html"\n<!doctype html><html><body><main><h1>New</h1></main></body></html>\n```',
      };
    },
    saveWorkspace: async (input) => {
      savedVfs = input.vfs;
      assert.equal(input.checkpointId, 'qir-action-1');
      return { status: 'saved', sessionId: 'desk-1', checkpointId: 'qir-action-1' };
    },
    verify: async () => ({
      score: 100, passed: true, checks: [], issues: [], summary: 'verified', critiqued: false,
    }),
  });

  const result: any = await executor.execute(activeRun(), continuation, { userSub: 'u1', runId: 'run-1' });
  assert.match(prompt, /FILE: index\.html/);
  assert.match(prompt, /Old/);
  assert.match(String(savedVfs?.['index.html']), /New/);
  assert.equal(result.eventType, 'worker.coding_completed');
  assert.equal(result.committedRun.status, 'COMPLETE');
  assert.equal(result.committedRun.goal.status, 'achieved');
  assert.equal(result.committedRun.artifacts[0].state, 'verified');
  assert.equal(result.committedRun.verifications.length, 1);
});

test('OpenRouter HTTP 402 remains the provider refusal, not an invented account-balance diagnosis', async () => {
  const executor = createQirServerCodingExecutor({
    modelId: 'nvidia/nemotron-test',
    loadWorkspace: async () => ({ status: 'loaded', sessionId: 'desk-1', checkpointCount: 1, vfs: { 'index.html': '<main>Old</main>' } }),
    modelRunner: async () => ({
      status: 'failure',
      failure: qirProviderFailure({
        provider: 'openrouter', modelId: 'nvidia/nemotron-test', httpStatus: 402,
        providerCode: 'payment_required', providerMessage: 'Provider policy refused this request.',
        retryable: false, route: 'qir-worker',
      }),
    }),
  });

  const result: any = await executor.execute(activeRun(), continuation, { userSub: 'u1', runId: 'run-1' });
  assert.equal(result.observation.status, 'failure');
  assert.equal(result.observation.error.code, 'PROVIDER_TRANSPORT');
  assert.match(result.observation.error.message, /HTTP 402/);
  assert.match(result.observation.error.message, /Provider policy refused this request/);
  assert.doesNotMatch(result.observation.error.message, /insufficient balance|top up|re-issu/i);
  assert.equal(result.payload.providerFailure.httpStatus, 402);
});
