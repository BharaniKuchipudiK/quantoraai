import test from 'node:test';
import assert from 'node:assert/strict';
import { qirRunControlState, sendQirRunControl } from './qir-run-controls.js';

test('run controls reflect durable lifecycle state', () => {
  assert.deepEqual(qirRunControlState('EXECUTING'), { pause: true, resume: false, cancel: true });
  assert.deepEqual(qirRunControlState('VERIFYING'), { pause: true, resume: false, cancel: true });
  assert.deepEqual(qirRunControlState('PAUSED'), { pause: false, resume: true, cancel: true });
  assert.deepEqual(qirRunControlState('COMPLETE'), { pause: false, resume: false, cancel: false });
  assert.deepEqual(qirRunControlState('FAILED_TERMINAL'), { pause: false, resume: false, cancel: false });
  assert.deepEqual(qirRunControlState(''), { pause: false, resume: false, cancel: false });
});

test('pause sends the exact durable run signal with credentials', async () => {
  let request = null;
  const result = await sendQirRunControl('browser-pilot-0123456789abcdef0123456789abcdef', 'pause', {
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        run: { runId: 'browser-pilot-0123456789abcdef0123456789abcdef', status: 'PAUSED' },
        durability: 'persisted',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.run.status, 'PAUSED');
  assert.equal(request.url, '/api/qir-runs');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'include');
  assert.deepEqual(request.body, {
    action: 'coding.pause',
    runId: 'browser-pilot-0123456789abcdef0123456789abcdef',
  });
});

test('cancel carries a bounded user reason', async () => {
  let body = null;
  await sendQirRunControl('run-safe-123', 'cancel', {
    reason: `  ${'x'.repeat(700)}  `,
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ run: { runId: 'run-safe-123', status: 'FAILED_TERMINAL' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(body.action, 'coding.cancel');
  assert.equal(body.runId, 'run-safe-123');
  assert.equal(body.reason.length, 512);
});

test('invalid identities and actions fail before any network call', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not run'); };
  assert.equal((await sendQirRunControl('bad id', 'pause', { fetchImpl })).ok, false);
  assert.equal((await sendQirRunControl('run-safe-123', 'delete', { fetchImpl })).ok, false);
  assert.equal(calls, 0);
});

test('server conflict is visible and preserves returned durable state', async () => {
  const result = await sendQirRunControl('run-safe-123', 'resume', {
    fetchImpl: async () => new Response(JSON.stringify({
      error: 'Only a PAUSED Run can resume; this one is EXECUTING.',
      run: { runId: 'run-safe-123', status: 'EXECUTING' },
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.run.status, 'EXECUTING');
  assert.match(result.error, /Only a PAUSED Run/);
});
