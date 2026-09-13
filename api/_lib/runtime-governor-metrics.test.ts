import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRuntimeGovernorMetrics } from './runtime-governor-metrics.js';

test('governor metrics count lifecycle outcomes once per lifecycle', () => {
  const metrics = summarizeRuntimeGovernorMetrics([
    { lifecycle_id: 'life:a', lifecycle_state: 'received', source: 'chat' },
    { lifecycle_id: 'life:a', lifecycle_state: 'recovering', source: 'chat', recovery_count: 1 },
    { lifecycle_id: 'life:a', lifecycle_state: 'completed', source: 'chat', terminal: true, verified: true },
    { lifecycle_id: 'life:b', lifecycle_state: 'received', source: 'qir' },
    { lifecycle_id: 'life:b', lifecycle_state: 'failed', source: 'qir', terminal: true, reason: 'stalled-without-terminal-outcome' },
  ], 24);

  assert.equal(metrics.source, 'measured');
  assert.equal(metrics.eventCount, 5);
  assert.equal(metrics.lifecycleCount, 2);
  assert.equal(metrics.terminalCount, 2);
  assert.equal(metrics.completedCount, 1);
  assert.equal(metrics.failedCount, 1);
  assert.equal(metrics.verifiedCompletedCount, 1);
  assert.equal(metrics.recoveredLifecycleCount, 1);
  assert.equal(metrics.stalledFailureCount, 1);
  assert.equal(metrics.verifiedCompletionRate, 0.5);
  assert.equal(metrics.recoveryRate, 0.5);
  assert.deepEqual(metrics.bySource, { chat: 3, qir: 2 });
});

test('outcome evaluation metrics expose deterministic and judge fallback states', () => {
  const metrics = summarizeRuntimeGovernorMetrics([
    { lifecycle_id: 'life:ok', lifecycle_state: 'completed', source: 'qir', terminal: true, verified: true, reason: 'outcome:satisfied' },
    { lifecycle_id: 'life:no', lifecycle_state: 'failed', source: 'qir', terminal: true, reason: 'outcome:failed' },
    { lifecycle_id: 'life:maybe', lifecycle_state: 'validating', source: 'qir', reason: 'outcome:indeterminate:model-judge-required' },
  ]);

  assert.equal(metrics.outcomeSatisfiedCount, 1);
  assert.equal(metrics.outcomeFailedCount, 1);
  assert.equal(metrics.outcomeIndeterminateCount, 1);
  assert.equal(metrics.modelJudgeRequiredCount, 1);
  assert.equal(metrics.activeLifecycleCount, 1);
});

test('empty measured window is reported as no-rows rather than zero-looking measured traffic', () => {
  const metrics = summarizeRuntimeGovernorMetrics([]);
  assert.equal(metrics.source, 'no-rows');
  assert.equal(metrics.lifecycleCount, 0);
  assert.equal(metrics.verifiedCompletionRate, null);
});
