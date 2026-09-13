import test from 'node:test';
import assert from 'node:assert/strict';
import { createQirCodingRunClient } from './qir-coding-run-core.js';
import { hashVfsContent } from './desk-checkpoints.js';

const vfs = { 'index.html': { content: '<html>saved</html>', language: 'html' } };
function setup(t, handler, overrides = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body && JSON.parse(init.body);
    calls.push({ url, body });
    return handler(url, body);
  };
  t.after(() => { globalThis.fetch = original; });
  const errors = [];
  const options = { enabled: true, sessionId: 'desk', executionOwner: 'server', workflowPilot: true, workflowPilotRunId: 'pilot-run', vfs, ...overrides };
  const client = createQirCodingRunClient({ onRun() {}, onError(e) { errors.push(e); }, readOptions: () => options });
  return { client, calls, errors, options };
}
const response = (status, data) => ({ ok: status < 400, status, json: async () => data });
test('worker submission uses one durable admission, never browser run creation or coding.attempt', async (t) => {
  const { client, calls } = setup(t, (_url, body) => response(202, { runId: 'pilot-run', workflowRunId: 'wrun_test', durability: 'scheduled' }));
  const run = await client.submitServerRun('Change the title');
  assert.equal(run?.status, 'QUEUED');
  assert.equal(run?.durability, 'scheduled');
  assert.deepEqual(calls.map(c => c.body), [{ action: 'coding.workflow_submit', sessionId: 'desk', goal: 'Change the title', workspaceHash: hashVfsContent(vfs) }]);
});
test('a reopened pilot with no journal row only reads, never creates a browser run', async (t) => {
  const { client, calls } = setup(t, () => response(404, { error: 'Not found' }));
  assert.equal(await client.refresh(), null);
  assert.deepEqual(calls, [{ url: '/api/qir-runs?runId=pilot-run', body: undefined }]);
});
test('unconfirmed scheduling is visible and never falls back to a second action', async (t) => {
  const { client, calls, errors } = setup(t, () => response(503, { error: 'Scheduling unconfirmed' }));
  assert.equal(await client.submitServerRun('Change title'), null);
  assert.equal(errors.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.action, 'coding.workflow_submit');
});
test('pilot awaiting account/desk approval fails closed without any writes', async (t) => {
  const { client, calls, errors } = setup(t, () => { throw new Error('Unexpected request'); }, { workflowPilotRunId: '' });
  assert.equal(await client.submitServerRun('Change title'), null);
  assert.equal(calls.length, 0);
  assert.match(errors[0].message, /not enabled|loading/i);
});

import { createDeskCheckpointSaver } from './desk-checkpoint-client.js';
import { recordDeskCheckpoint } from './desk-checkpoints.js';
test('server checkpoint adoption waits for old saves and does not resave the published result', async () => {
  const initial = recordDeskCheckpoint([], vfs, { label: 'Saved' });
  const changed = recordDeskCheckpoint(initial, { 'index.html': 'Local change' }, { label: 'Local' });
  const published = recordDeskCheckpoint(initial, { 'index.html': 'Verified worker output' }, { label: 'Worker' });
  let release;
  let saves = 0;
  const saver = createDeskCheckpointSaver('desk', { save: async () => {
    saves++;
    await new Promise(resolve => { release = resolve; });
    return { ok: false, conflict: true, reason: 'Newer worker save' };
  } });
  saver.initialize({ ok: true, revision: 1, entries: initial });
  const pending = saver.save(changed);
  await Promise.resolve();
  let settled = false;
  const wait = saver.settle().then(() => { settled = true; });
  assert.equal(settled, false);
  release(); await pending; await wait;
  saver.adopt({ ok: true, revision: 2, entries: published });
  assert.deepEqual(await saver.save(published), { ok: true, saved: 0 });
  assert.equal(saves, 1);
});

import { describeQirDurability } from './qir-durability.js';
test('scheduled acknowledgement is never presented as a persisted or verified run', () => {
  const display = describeQirDurability({ run: { runId: 'pilot', status: 'QUEUED', durability: 'scheduled' } });
  assert.equal(display.label, 'Background run · SCHEDULED');
  assert.equal(display.recording, false);
  assert.match(display.detail, /not yet confirmed/);
  const uncertain = describeQirDurability({ run: { status: 'QUEUED' }, error: { reason: 'scheduling-unconfirmed' } });
  assert.match(uncertain.label, /UNCONFIRMED/);
});
