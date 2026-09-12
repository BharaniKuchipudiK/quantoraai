import test from 'node:test';
import assert from 'node:assert/strict';
import { describeQirDurability } from './qir-durability.js';
import { buildDeskContextPacket, mergeLiveDeskProbe } from './studio-desk-context.js';

const run = { runId: 'saved-run', status: 'COMPLETE' };
test('historical completion does not certify unverified Preview checks', () => {
  const result = describeQirDurability({ run, previewChecks: [{ state: 'unverified', ok: false }] });
  assert.equal(result.label, 'Run finished · UNVERIFIED');
  assert.equal(run.status, 'COMPLETE');
});
test('real HTML packet with a render probe finishes without implying all controls were tested', () => {
  const html = '<!doctype html><html><body><h1>Hello</h1></body></html>';
  const packet = mergeLiveDeskProbe(buildDeskContextPacket({ vfs: { 'index.html': html }, html }), { pageRendered: true });
  assert.ok(packet.checks.some(check => check.id.startsWith('truth-') && check.state === 'unverified'));
  const result = describeQirDurability({ run, previewChecks: packet.checks });
  assert.equal(result.label, 'Run finished · UNVERIFIED');
  assert.match(result.detail, /no automatic check is implied/);
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
