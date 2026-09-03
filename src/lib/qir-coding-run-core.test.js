import assert from 'node:assert/strict';
import test from 'node:test';
import { qirCodingRunCanStart } from './qir-coding-run-core.js';

const run = (status = 'QUEUED', extras = {}) => ({
  runId: 'coding-run-1',
  status,
  cursor: { stepId: null, actionId: null, attempt: 0 },
  artifacts: [],
  ...extras,
});

test('a durable queued Coding Run exists before an artifact can start execution', () => {
  assert.equal(qirCodingRunCanStart(run(), '', ''), false);
  assert.equal(qirCodingRunCanStart(run(), null, null), false);
});

test('the queued Run starts only after candidate artifact bytes exist', () => {
  assert.equal(qirCodingRunCanStart(run(), 'coding-desk://session/assembly/abc', '<html>ok</html>'), true);
});

test('a QIR-owned model attempt may attach its first artifact without creating a second action', () => {
  const executing = run('EXECUTING', {
    cursor: { stepId: 'coding-model-1', actionId: 'coding-model-action-1', attempt: 0 },
  });
  assert.equal(qirCodingRunCanStart(
    executing,
    'coding-desk://session/assembly/abc',
    '<html>ok</html>',
  ), true);
});

test('an already-artifacted or terminal Run cannot be started again by a late artifact callback', () => {
  const artifact = {
    artifactId: 'coding-desk-vfs',
    generation: 1,
    ref: 'coding-desk://session/assembly/abc#sha256=x',
    state: 'candidate',
    createdByActionId: 'coding-model-action-1',
  };
  assert.equal(qirCodingRunCanStart(run('EXECUTING', {
    cursor: { stepId: 'coding-model-1', actionId: 'coding-model-action-1', attempt: 0 },
    artifacts: [artifact],
  }), 'coding-desk://session/assembly/late', '<html>late</html>'), false);

  for (const status of ['VERIFYING', 'REPAIRING', 'COMPLETE']) {
    assert.equal(qirCodingRunCanStart(run(status), 'coding-desk://session/assembly/abc', '<html>ok</html>'), false);
  }
});
