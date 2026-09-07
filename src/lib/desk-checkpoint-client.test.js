/**
 * The save is a second copy, and a failed backup must never cost the work.
 *
 * This helper runs from the desk's commit path. Anything it throws lands in
 * the middle of accepting a build, so the one behaviour that matters more than
 * saving successfully is failing quietly enough that the person still has what
 * they were writing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHECKPOINTS_PER_SAVE, persistDeskCheckpoints } from './desk-checkpoint-client.js';

function fakeFetch(reply) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (typeof reply === 'function') return reply();
    return reply;
  };
  return { calls, fetchFn };
}

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
const failed = (status, payload) => ({ ok: false, status, json: async () => payload });

const entry = (id, vfs) => ({ id, at: 1, label: 'Build update', origin: 'commit', vfs });

test('a history is posted to the checkpoint route with its session', async () => {
  const { calls, fetchFn } = fakeFetch(ok({ saved: 1 }));
  const result = await persistDeskCheckpoints('desk_1', [entry('ckpt_a', { 'a.js': 'x' })], { fetchFn });

  assert.equal(result.ok, true);
  assert.equal(result.saved, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/desk-checkpoints');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].body.sessionId, 'desk_1');
  assert.deepEqual(calls[0].body.history[0].vfs, { 'a.js': 'x' });
});

test('the session cookie rides along, or the server cannot tell whose work this is', () => {
  const { calls, fetchFn } = fakeFetch(ok({ saved: 0 }));
  return persistDeskCheckpoints('desk_1', [entry('ckpt_a', { 'a.js': 'x' })], { fetchFn }).then(() => {
    assert.equal(calls[0].init.credentials, 'same-origin');
  });
});

/*
 * THE ONE THAT MATTERS. A thrown error here lands inside accepting a build,
 * so a network failure while backing the work up would destroy the work.
 */
test('a network failure is returned, never thrown into the commit that called it', async () => {
  const { fetchFn } = fakeFetch(() => { throw new Error('offline'); });
  const result = await persistDeskCheckpoints('desk_1', [entry('ckpt_a', { 'a.js': 'x' })], { fetchFn });
  assert.equal(result.ok, false);
  assert.match(result.reason, /offline/);
});

test('a server refusal is reported as a failure, never as a save', async () => {
  const { fetchFn } = fakeFetch(failed(503, { error: 'The checkpoints could not be stored, so keep the history you have.' }));
  const result = await persistDeskCheckpoints('desk_1', [entry('ckpt_a', { 'a.js': 'x' })], { fetchFn });
  assert.equal(result.ok, false, 'a 503 must not read as a stored history');
  assert.equal(result.saved, 0);
  assert.match(result.reason, /could not be stored/);
});

test('a reply that is not JSON still fails honestly rather than claiming a save', async () => {
  const { fetchFn } = fakeFetch({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
  const result = await persistDeskCheckpoints('desk_1', [entry('ckpt_a', { 'a.js': 'x' })], { fetchFn });
  assert.equal(result.ok, false);
  assert.match(result.reason, /502/);
});

test('nothing to save asks for nothing', async () => {
  const { calls, fetchFn } = fakeFetch(ok({ saved: 0 }));
  const empty = await persistDeskCheckpoints('desk_1', [], { fetchFn });
  assert.equal(empty.ok, true, 'an empty history is not an error');
  assert.equal(calls.length, 0, 'an empty history must not cost a request on every render');

  const noSession = await persistDeskCheckpoints('', [entry('ckpt_a', { 'a.js': 'x' })], { fetchFn });
  assert.equal(noSession.ok, false);
  assert.equal(calls.length, 0, 'there is nothing to save a history against');
});

test('only the newest checkpoints are sent, so one request cannot grow without bound', async () => {
  const history = Array.from({ length: MAX_CHECKPOINTS_PER_SAVE + 10 }, (_, i) => entry(`ckpt_${i}`, { 'a.js': `v${i}` }));
  const { calls, fetchFn } = fakeFetch(ok({ saved: MAX_CHECKPOINTS_PER_SAVE }));
  await persistDeskCheckpoints('desk_1', history, { fetchFn });

  const sent = calls[0].body.history;
  assert.equal(sent.length, MAX_CHECKPOINTS_PER_SAVE);
  assert.equal(sent[sent.length - 1].id, `ckpt_${history.length - 1}`, 'the tail is what a rewind reaches for');
});
