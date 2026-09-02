import assert from 'node:assert/strict';
import test from 'node:test';
import { qirCodingRunCanStart } from './qir-coding-run-core.js';

const run = (status = 'QUEUED') => ({ runId: 'coding-run-1', status });

test('a durable queued Coding Run exists before an artifact can start execution', () => {
  assert.equal(qirCodingRunCanStart(run(), '', ''), false);
  assert.equal(qirCodingRunCanStart(run(), null, null), false);
});

test('the queued Run starts only after candidate artifact bytes exist', () => {
  assert.equal(qirCodingRunCanStart(run(), 'coding-desk://session/assembly/abc', '<html>ok</html>'), true);
});

test('an already-started or terminal Run cannot be started again by a late artifact callback', () => {
  for (const status of ['EXECUTING', 'VERIFYING', 'REPAIRING', 'COMPLETE']) {
    assert.equal(qirCodingRunCanStart(run(status), 'coding-desk://session/assembly/abc', '<html>ok</html>'), false);
  }
});
