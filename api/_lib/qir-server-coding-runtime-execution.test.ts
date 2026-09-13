import assert from 'node:assert/strict';
import test from 'node:test';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from './qir-contracts.js';
import { createQirServerCodingExecutor } from './qir-server-coding-executor.js';

function activeRun(): QirAgentRun {
  const now = '2026-09-12T00:00:00.000Z';
  return {
    version: QIR_CONTRACT_VERSION,
    runId: 'runtime-run-1',
    goal: { statement: 'Change Old to New', status: 'confirmed' },
    status: 'EXECUTING',
    steps: [{
      stepId: 'step-1', taskId: 'coding.model', objective: 'Change Old to New', dependsOn: [],
      status: 'active', requiresVerification: true, actionId: 'action-1',
    }],
    cursor: { stepId: 'step-1', actionId: 'action-1', attempt: 0 },
    artifacts: [], observations: [], verifications: [], checkpoints: [],
    budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: now, updatedAt: now,
  };
}

const continuation = { stepId: 'step-1', taskId: 'coding.model', actionId: 'action-1' };

test('ownership loss at every async boundary stops subsequent Coding stages', async () => {
  const stages = ['load', 'model', 'save', 'runtime', 'verify'];
  for (const abortAt of ['before', ...stages]) {
    const controller = new AbortController();
    const called: string[] = [];
    const reach = (stage: string) => {
      called.push(stage);
      if (abortAt === stage) controller.abort();
    };
    const base = baseOptions();
    const executor = createQirServerCodingExecutor({
      ...base,
      loadWorkspace: async () => { reach('load'); return base.loadWorkspace(); },
      modelRunner: async (input) => {
        assert.equal(input.signal, controller.signal, 'the provider must receive worker ownership');
        reach('model');
        return base.modelRunner();
      },
      saveWorkspace: async (input) => { reach('save'); return base.saveWorkspace(input); },
      runtimeVerify: async (input) => {
        assert.equal(input.signal, controller.signal);
        reach('runtime');
        return { status: 'passed', commands: [], results: [] };
      },
      verify: async () => {
        reach('verify');
        return { score: 100, passed: true, checks: [], issues: [], summary: 'verified', critiqued: false };
      },
    });
    if (abortAt === 'before') controller.abort();
    const result: any = await executor.execute(activeRun(), continuation, {
      userSub: 'u1', runId: 'runtime-run-1', signal: controller.signal,
    });
    assert.deepEqual(called, stages.slice(0, stages.indexOf(abortAt) + 1), abortAt);
    assert.equal(result.observation.evidence[0].kind, 'runtime.ownership_lost', abortAt);
    assert.equal(result.committedRun, undefined, 'ownership loss must never promote a candidate');
  }
});

function sourceVfs() {
  return {
    'package.json': JSON.stringify({ scripts: { test: 'node test.js', build: 'node build.js' } }),
    'app.js': 'export const value = "Old";',
    'test.js': 'import { value } from "./app.js"; if (value !== "New") process.exit(1)',
    'build.js': 'console.log("build")',
  };
}

function changedModel() {
  return async () => ({
    status: 'success' as const,
    provider: 'openrouter' as const,
    modelId: 'test/model',
    text: [
      '```json filepath="package.json"',
      JSON.stringify({ scripts: { test: 'node test.js', build: 'node build.js' } }),
      '```',
      '```js filepath="app.js"',
      'export const value = "New";',
      '```',
      '```js filepath="build.js"',
      'console.log("build")',
      '```',
    ].join('\n'),
  });
}

function baseOptions() {
  return {
    modelId: 'test/model',
    loadWorkspace: async () => ({
      status: 'loaded' as const,
      sessionId: 'desk-runtime-1',
      checkpointCount: 1,
      vfs: sourceVfs(),
    }),
    modelRunner: changedModel(),
    saveWorkspace: async (input: any) => ({
      status: 'saved' as const,
      sessionId: 'desk-runtime-1',
      checkpointId: input.checkpointId,
    }),
  };
}

test('removing or replacing a required check cannot save a candidate or reach completion', async () => {
  for (const manifest of ['{}', '{invalid', JSON.stringify({ scripts: { test: 'exit 0', build: 'node build.js' } })]) {
    let saved = false;
    let verified = false;
    const executor = createQirServerCodingExecutor({
      ...baseOptions(),
      modelRunner: async () => ({ status: 'success', provider: 'openrouter', modelId: 'test/model',
        text: '```json filepath="package.json"\n' + manifest + '\n```',
      }),
      saveWorkspace: async () => { saved = true; throw new Error('Candidate must not be saved'); },
      runtimeVerify: async () => { verified = true; throw new Error('Checks must not be skipped'); },
    });
    const result: any = await executor.execute(activeRun(), continuation, { userSub: 'u1', runId: 'runtime-run-1' });
    assert.equal(result.observation.error.code, 'ARTIFACT_INVALID');
    assert.equal(saved, false);
    assert.equal(verified, false);
  }
});

test('a real failing repository test blocks completion and becomes repair evidence', async () => {
  let semanticVerifierCalled = false;
  const executor = createQirServerCodingExecutor({
    ...baseOptions(),
    runtimeVerify: async () => ({
      status: 'failed',
      reason: 'Real repository command failed: CI=1 npm run test (exit 1).',
      failureCode: 'RUNTIME_FAILURE',
      command: 'CI=1 npm run test',
      exitCode: 1,
      output: 'AssertionError: expected New',
      commands: ['npm install --no-audit --no-fund', 'CI=1 npm run test', 'CI=1 npm run build'],
      results: [
        { command: 'npm install --no-audit --no-fund', exitCode: 0, output: 'installed', outputTruncated: false },
        { command: 'CI=1 npm run test', exitCode: 1, output: 'AssertionError: expected New', outputTruncated: false },
      ],
    }),
    verify: async () => {
      semanticVerifierCalled = true;
      return { score: 100, passed: true, checks: [], issues: [], summary: 'verified', critiqued: false };
    },
  });

  const result: any = await executor.execute(activeRun(), continuation, { userSub: 'u1', runId: 'runtime-run-1' });
  assert.equal(result.eventType, 'worker.repository_execution_failed');
  assert.equal(result.committedRun.status, 'REPAIRING');
  assert.equal(result.observation.kind, 'runtime');
  assert.equal(result.observation.error.code, 'RUNTIME_FAILURE');
  assert.match(result.observation.error.message, /CI=1 npm run test/);
  assert.match(result.observation.error.message, /AssertionError/);
  assert.equal(result.payload.repositoryRuntime.exitCode, 1);
  assert.equal(semanticVerifierCalled, false, 'semantic verification must not overrule a real failing command');
});

test('passing repository commands become independent completion evidence', async () => {
  const executor = createQirServerCodingExecutor({
    ...baseOptions(),
    runtimeVerify: async () => ({
      status: 'passed',
      commands: ['npm install --no-audit --no-fund', 'CI=1 npm run test', 'CI=1 npm run build'],
      results: [
        { command: 'npm install --no-audit --no-fund', exitCode: 0, output: 'installed', outputTruncated: false },
        { command: 'CI=1 npm run test', exitCode: 0, output: 'tests passed', outputTruncated: false },
        { command: 'CI=1 npm run build', exitCode: 0, output: 'built', outputTruncated: false },
      ],
    }),
    verify: async () => ({ score: 100, passed: true, checks: [], issues: [], summary: 'verified', critiqued: false }),
  });

  const result: any = await executor.execute(activeRun(), continuation, { userSub: 'u1', runId: 'runtime-run-1' });
  assert.equal(result.eventType, 'worker.coding_completed');
  assert.equal(result.committedRun.status, 'COMPLETE');
  assert.equal(result.payload.repositoryRuntime.status, 'passed');
  assert.equal(result.committedRun.verifications.length, 1);
  assert.ok(
    result.committedRun.verifications[0].evidenceRefs.some((ref: string) => ref.startsWith('sandbox-command:')),
    'real command exits must be part of Proof of Done',
  );
});

test('repository checks that are declared but cannot execute fail closed', async () => {
  let semanticVerifierCalled = false;
  const executor = createQirServerCodingExecutor({
    ...baseOptions(),
    runtimeVerify: async () => ({
      status: 'skipped',
      reason: 'Vercel Sandbox credentials are not configured; no real repository command was executed.',
      commands: ['npm install --no-audit --no-fund', 'CI=1 npm run test'],
    }),
    verify: async () => {
      semanticVerifierCalled = true;
      return { score: 100, passed: true, checks: [], issues: [], summary: 'verified', critiqued: false };
    },
  });

  const result: any = await executor.execute(activeRun(), continuation, { userSub: 'u1', runId: 'runtime-run-1' });
  assert.equal(result.eventType, 'worker.repository_execution_unavailable');
  assert.equal(result.committedRun.status, 'FAILED_TERMINAL');
  assert.equal(result.observation.error.code, 'INTERNAL_INVARIANT');
  assert.equal(result.observation.error.retryable, false);
  assert.match(result.observation.error.message, /no real repository command was executed/i);
  assert.equal(semanticVerifierCalled, false);
});

test('a workspace with no executable package checks may continue to semantic verification', async () => {
  let semanticVerifierCalled = false;
  const executor = createQirServerCodingExecutor({
    ...baseOptions(),
    runtimeVerify: async () => ({
      status: 'skipped',
      reason: 'No supported package.json verification scripts were found.',
      commands: [],
    }),
    verify: async () => {
      semanticVerifierCalled = true;
      return { score: 100, passed: true, checks: [], issues: [], summary: 'verified', critiqued: false };
    },
  });

  const result: any = await executor.execute(activeRun(), continuation, { userSub: 'u1', runId: 'runtime-run-1' });
  assert.equal(semanticVerifierCalled, true);
  assert.equal(result.eventType, 'worker.coding_completed');
  assert.equal(result.committedRun.status, 'COMPLETE');
  assert.equal(result.payload.repositoryRuntime.status, 'skipped');
});