/**
 * The save is a second copy, and a failed backup must never cost the work.
 *
 * This helper runs from the desk's commit path. Anything it throws lands in
 * the middle of accepting a build, so the one behaviour that matters more than
 * saving successfully is failing quietly enough that the person still has what
 * they were writing.
 */
import { readFileSync } from 'node:fs';
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

/*
 * ---------------------------------------------------------------------------
 * A CHECKPOINT CHAIN BELONGS TO ONE CHAT, AND ONLY THAT ONE.
 *
 * Both of these were found by review of #598, and both were made LIVE by the
 * shape fix that finally let checkpoints exist at all. Before it the chain was
 * always empty, so neither could fire.
 *
 * The load and save effects read `deskSessionIdRef.current`, a ref updated by
 * an effect DECLARED LATER in AiStudio. React runs effects in declaration
 * order, so on every switch from chat A to chat B they ran first and still saw
 * A. The loader fetched A's chain and adopted it into B, whose history was a
 * single `baseline` entry and therefore "untouched" -- so B's Rewind menu
 * offered A's files and the next save persisted the mixed chain under B. The
 * save had the worse version of the same bug: B's one baseline entry written
 * under A's id, replacing a real history.
 *
 * Not a race. Declaration order, so it happened every time.
 *
 * Asserted against the source because the defect IS the ordering: no unit of
 * these functions can see it, and a browser gate would have to drive two chats
 * and a reload to catch what one line states plainly.
 * ---------------------------------------------------------------------------
 */
const studioSource = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');

test('the checkpoint load and save are bound to the session, not to a ref that lags', () => {
  assert.ok(studioSource.length > 5000, `AiStudio.jsx read as ${studioSource.length} bytes; this gate cannot check what it cannot find`);

  const load = studioSource.indexOf('loadDeskCheckpoints(sessionId)');
  const save = studioSource.indexOf('persistDeskCheckpoints(sessionId, deskCheckpoints)');
  assert.ok(load > 0 && save > 0, 'the checkpoint load/save effects are no longer recognisable, so this gate is checking nothing');

  for (const [name, at] of [['load', load], ['save', save]]) {
    // The window is the effect body above the call: enough for its own
    // `const sessionId = ...`, not enough to reach the neighbouring effect.
    const body = studioSource.slice(Math.max(0, at - 600), at);
    const bound = /const sessionId = activeSessionId;/.test(body);
    const lagging = /const sessionId = deskSessionIdRef\.current;/.test(body);
    assert.ok(
      bound && !lagging,
      `the checkpoint ${name} effect reads deskSessionIdRef, which is updated by a LATER effect. On a chat switch it sees the previous chat, `
      + `so ${name === 'load' ? "one chat's history is offered in another" : "the new chat's baseline overwrites the old chat's stored history"}.`,
    );
  }

  assert.match(
    studioSource,
    /if \(cancelled \|\| sessionId !== activeSessionId\) return;/,
    'the in-flight load no longer re-checks the session on resolve, so a chain adopted late lands in whatever chat is open by then',
  );
});

test('a rewind moves the session\'s cached desk, not only React state', () => {
  const at = studioSource.indexOf('const handleDeskRewind');
  assert.ok(at > 0, 'handleDeskRewind is no longer recognisable, so this gate is checking nothing');
  const body = studioSource.slice(at, at + 1400);

  assert.match(
    body,
    /desksRef\.current = updateDesk\(desksRef\.current, activeSessionIdRef\.current, \{ vfs: plan\.vfs \}\)/,
    'a rewind updates only React state again. desksRef keeps the post-build tree, so switching chats and coming back restores it through the '
    + '"a live desk beats a saved snapshot" branch -- silently undoing the rewind.',
  );
  assert.ok(
    body.indexOf('desksRef.current = updateDesk') < body.indexOf('setVfs(plan.vfs)'),
    'the cached desk is updated after the render state, which leaves a window where the two disagree',
  );
});
