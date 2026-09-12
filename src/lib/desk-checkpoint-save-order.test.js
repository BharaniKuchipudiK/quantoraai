import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeskCheckpointSaver } from './desk-checkpoint-client.js';
import { hashVfsContent } from './desk-checkpoints.js';
const entry = (id) => ({ id, vfs: { 'index.html': id }, hash: hashVfsContent({ 'index.html': id }) });
const loaded = (revision, entries = []) => ({ ok: true, revision, entries });

test('rapid saves are serialized and each uses the acknowledged revision', async () => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const saver = createDeskCheckpointSaver('desk', { save: async (id, history, options) => {
    calls.push({ id, history, ...options });
    if (calls.length === 1) await barrier;
    return { ok: true, saved: history.length, revision: options.expectedRevision + 1 };
  } });
  saver.initialize(loaded(8));
  const history = [entry('a')];
  const first = saver.save(history);
  history.push(entry('b'));
  const second = saver.save(history);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  release();
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.deepEqual(calls.map((call) => call.expectedRevision), [8, 9]);
  assert.deepEqual(calls.map((call) => call.history.length), [1, 2]);
});

test('two tabs on the same revision cannot overwrite the winner', async () => {
  let revision = 1;
  let stored = 'initial';
  const save = async (_id, history, options) => {
    if (options.expectedRevision !== revision) return { ok: false, conflict: true, reason: 'save-conflict' };
    stored = history.at(-1).id;
    return { ok: true, revision: ++revision };
  };
  const a = createDeskCheckpointSaver('desk', { save });
  const b = createDeskCheckpointSaver('desk', { save });
  a.initialize(loaded(1)); b.initialize(loaded(1));
  const results = await Promise.all([a.save([entry('a')]), b.save([entry('b')])]);
  assert.deepEqual(results.map((result) => result.ok), [true, false]);
  assert.equal(stored, 'a');
  assert.equal((await b.save([entry('b'), entry('c')])).ok, false);
  assert.equal(stored, 'a');
});

test('lost acknowledgement blocks queued writes instead of guessing a revision', async () => {
  let calls = 0;
  const saver = createDeskCheckpointSaver('desk', { save: async () => {
    calls++; return { ok: false, reason: 'timeout' };
  } });
  saver.initialize(loaded(2));
  await Promise.all([saver.save([entry('a')]), saver.save([entry('a'), entry('b')])]);
  assert.equal(calls, 1);
});

test('a baseline cannot replace restored work and saves wait for a verified load', async () => {
  let calls = 0;
  const saver = createDeskCheckpointSaver('desk', { save: async () => { calls++; return { ok: true, revision: 5 }; } });
  assert.equal((await saver.save([entry('old')])).ok, false);
  saver.initialize(loaded(4, [entry('new')]));
  assert.equal((await saver.save([entry('old')])).ok, false);
  assert.equal(calls, 0);
});
