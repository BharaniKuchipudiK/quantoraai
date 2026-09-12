import test from 'node:test';
import assert from 'node:assert/strict';
import { describeQirDurability } from './qir-durability.js';

const run = { runId: 'saved-run', status: 'COMPLETE' };
test('historical completion does not certify unverified Preview checks', () => {
  const result = describeQirDurability({ run, previewChecks: [{ state: 'unverified', ok: false }] });
  assert.equal(result.label, 'Run · CHECKS PENDING');
  assert.equal(run.status, 'COMPLETE');
});
test('failed Preview checks take precedence over pending checks', () => {
  const result = describeQirDurability({ run, previewChecks: [{ state: 'unverified' }, { state: 'fix', ok: false }] });
  assert.equal(result.label, 'Run · NEEDS ATTENTION');
});
test('passing checks and non-complete runs retain their existing labels', () => {
  assert.equal(describeQirDurability({ run, previewChecks: [{ state: 'ok', ok: true }] }).label, 'Run · COMPLETE');
  assert.equal(describeQirDurability({ run: { ...run, status: 'EXECUTING' }, previewChecks: [{ state: 'fix' }] }).label, 'Run · EXECUTING');
  assert.equal(describeQirDurability({ run }).label, 'Run · COMPLETE');
});
