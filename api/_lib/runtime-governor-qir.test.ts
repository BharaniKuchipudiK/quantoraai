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

test('QIR completion is not promoted when evaluated outcome lacks proof', async () => {
  const events: RuntimeGovernorEvent[] = [];
  await observeQirRunStatus({
    userSub: 'user-governor-qir',
    runId: 'qir-governor-002',
    status: 'COMPLETE',
    outcome: {
      originalIntent: 'Ship a verified outcome evaluator',
      criteria: [{ criterionId: 'wired', statement: 'Evaluator is wired into production runtime' }],
      evidence: [],
    },
  }, async event => { events.push(event); });

  assert.equal(events.at(-1)?.state, 'validating');
  assert.equal(events.at(-1)?.terminal, false);
  assert.equal(events.at(-1)?.verified, false);
  assert.equal(events.at(-1)?.reason, 'outcome:indeterminate');
});

test('QIR completion is verified when deterministic outcome evidence satisfies intent', async () => {
  const events: RuntimeGovernorEvent[] = [];
  await observeQirRunStatus({
    userSub: 'user-governor-qir',
    runId: 'qir-governor-003',
    status: 'COMPLETE',
    outcome: {
      originalIntent: 'Ship a verified outcome evaluator',
      criteria: [{ criterionId: 'wired', statement: 'Evaluator is wired into production runtime' }],
      evidence: [{
        evidenceId: 'evidence-wired',
        criterionId: 'wired',
        verdict: 'passed',
        source: 'verifier',
        ref: 'ci:wiring-gate',
      }],
    },
  }, async event => { events.push(event); });

  assert.equal(events.at(-1)?.state, 'completed');
  assert.equal(events.at(-1)?.terminal, true);
  assert.equal(events.at(-1)?.verified, true);
  assert.equal(events.at(-1)?.reason, 'outcome:satisfied');
  assert.equal(events.at(-1)?.evidenceRef, 'ci:wiring-gate');
});
