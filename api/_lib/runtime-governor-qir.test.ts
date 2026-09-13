import test from 'node:test';
import assert from 'node:assert/strict';
import { observeQirRunStatus, runtimeStateForQir } from './runtime-governor-qir.js';
import type { RuntimeGovernorEvent } from './runtime-governor.js';

test('QIR durable states map into the canonical governor lifecycle', () => {
  assert.equal(runtimeStateForQir('QUEUED'), 'received');
  assert.equal(runtimeStateForQir('PLANNING'), 'planned');
  assert.equal(runtimeStateForQir('EXECUTING'), 'executing');
  assert.equal(runtimeStateForQir('VERIFYING'), 'validating');
  assert.equal(runtimeStateForQir('REPAIRING'), 'recovering');
  assert.equal(runtimeStateForQir('COMPLETE'), 'completed');
  assert.equal(runtimeStateForQir('FAILED_TERMINAL'), 'failed');
});

test('QIR resume keeps the same lifecycle and run identity', async () => {
  const events: RuntimeGovernorEvent[] = [];
  const write = async (event: RuntimeGovernorEvent) => { events.push(event); };
  await observeQirRunStatus({ userSub: 'user-governor-qir', runId: 'qir-governor-001', status: 'EXECUTING' }, write);
  await observeQirRunStatus({ userSub: 'user-governor-qir', runId: 'qir-governor-001', status: 'REPAIRING' }, write);
  await observeQirRunStatus({ userSub: 'user-governor-qir', runId: 'qir-governor-001', status: 'VERIFYING' }, write);
  await observeQirRunStatus({ userSub: 'user-governor-qir', runId: 'qir-governor-001', status: 'COMPLETE' }, write);
  assert.equal(new Set(events.map(event => event.lifecycleId)).size, 1);
  assert.equal(new Set(events.map(event => event.runId)).size, 1);
  assert.equal(events.at(-1)?.verified, true);
  assert.equal(events.at(-1)?.terminal, true);
});
