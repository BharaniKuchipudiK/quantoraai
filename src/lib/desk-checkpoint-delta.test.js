/**
 * A restore is either faithful or refused. There is no third outcome.
 *
 * Delta-encoding a checkpoint history is what makes it small enough to keep
 * across a reload — and it introduces the one failure a pile of full copies
 * cannot have: a broken link silently yields a tree assembled from two
 * different moments. That tree looks fine. The person keeps building on it.
 * By the time anything is noticed, the good state is gone.
 *
 * So the tests that matter here are not the round-trips, which are easy. They
 * are the ones that prove a corrupt chain REFUSES, names where it broke, and
 * hands back the last state it could actually verify.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashVfsContent, planDeskRestore, recordDeskCheckpoint } from './desk-checkpoints.js';
import {
  DELTA_MAX_BYTES,
  applyDeskVfsDelta,
  deskDeltaStorable,
  deskVfsDelta,
  deskCheckpointStepsFromRows,
  hydrateDeskCheckpointHistory,
  planDeskCheckpointChain,
  replayDeskCheckpointChain,
} from './desk-checkpoint-delta.js';

const roundTrip = (before, after) => applyDeskVfsDelta(before, deskVfsDelta(before, after));

test('rewind persists the restored tree as the server head and remains undoable', () => {
  const original = { 'index.html': 'working', 'quantity.mjs': 'limit 99' };
  const edited = { 'index.html': 'broken', 'quantity.mjs': 'limit 100' };
  const history = recordDeskCheckpoint([], original, { label: 'Working' });
  const restored = planDeskRestore(history, history[0].id, edited);
  assert.equal(restored.ok, true);
  const saved = planDeskCheckpointChain(restored.history);
  const reopened = replayDeskCheckpointChain({ steps: saved.steps });
  assert.equal(reopened.ok, true);
  assert.deepEqual(reopened.vfs, original, 'worker must receive the same files Rewind put on the desk');
  const before = restored.history.find(entry => entry.hash === hashVfsContent(edited));
  assert.ok(before, 'the replaced files remain recoverable');
  const undone = planDeskRestore(restored.history, before.id, restored.vfs);
  const undoReload = replayDeskCheckpointChain({ steps: planDeskCheckpointChain(undone.history).steps });
  assert.equal(undoReload.ok, true);
  assert.deepEqual(undoReload.vfs, edited);
});

test('a delta plus the tree it came from is exactly the tree it went to', () => {
  const cases = [
    [{}, {}],
    [{}, { 'a.js': 'one' }],
    [{ 'a.js': 'one' }, {}],
    [{ 'a.js': 'one' }, { 'a.js': 'two' }],
    [{ 'a.js': 'one' }, { 'a.js': 'one' }],
    [{ 'a.js': 'one', 'b.css': 'x' }, { 'a.js': 'one', 'c.html': 'y' }],
    [{ 'keep.js': 'k', 'drop.js': 'd' }, { 'keep.js': 'k' }],
    [{ 'old/name.js': 'body' }, { 'new/name.js': 'body' }],
    [{ 'a.js': '' }, { 'a.js': 'now has content' }],
    [{ 'a.js': 'gone empty' }, { 'a.js': '' }],
  ];
  for (const [before, after] of cases) {
    assert.deepEqual(roundTrip(before, after), after, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
});

test('a delta carries only what changed, so a one-file edit stores one file', () => {
  const before = { 'a.js': 'unchanged', 'b.js': 'unchanged', 'c.js': 'old' };
  const delta = deskVfsDelta(before, { ...before, 'c.js': 'new' });
  assert.deepEqual(Object.keys(delta.changed), ['c.js'], 'an untouched file must not be restored into the row');
  assert.deepEqual(delta.removed, []);
});

test('a rename is an add and a remove, never a guess about which file became which', () => {
  const delta = deskVfsDelta({ 'old.js': 'body' }, { 'new.js': 'body' });
  assert.deepEqual(delta.changed, { 'new.js': 'body' });
  assert.deepEqual(delta.removed, ['old.js']);
});

test('applying a delta never mutates the tree it was given', () => {
  const before = Object.freeze({ 'a.js': 'one' });
  const after = applyDeskVfsDelta(before, deskVfsDelta(before, { 'a.js': 'two' }));
  assert.equal(before['a.js'], 'one', 'the caller still holds the state it had');
  assert.equal(after['a.js'], 'two');
});

test('a chain built from a real history replays to the state the desk was in', () => {
  let history = [];
  history = recordDeskCheckpoint(history, { 'index.html': '<h1>one</h1>' }, { label: 'first' });
  history = recordDeskCheckpoint(history, { 'index.html': '<h1>two</h1>', 'app.css': 'body{}' }, { label: 'second' });
  history = recordDeskCheckpoint(history, { 'app.css': 'body{}' }, { label: 'third, html deleted' });

  const { steps, stoppedAt } = planDeskCheckpointChain(history);
  assert.equal(stoppedAt, null);
  assert.equal(steps.length, 3);

  const replay = replayDeskCheckpointChain({ steps });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.vfs, { 'app.css': 'body{}' }, 'the deletion in the last checkpoint survived the round trip');
  assert.equal(replay.verifiedSteps, 3);
});

test('a chain can be replayed to any point in it, not only the end', () => {
  let history = [];
  history = recordDeskCheckpoint(history, { 'a.js': 'v1' }, { label: 'v1' });
  history = recordDeskCheckpoint(history, { 'a.js': 'v2' }, { label: 'v2' });
  history = recordDeskCheckpoint(history, { 'a.js': 'v3' }, { label: 'v3' });
  const { steps } = planDeskCheckpointChain(history);

  const middle = replayDeskCheckpointChain({ steps: steps.slice(0, 2) });
  assert.equal(middle.ok, true);
  assert.deepEqual(middle.vfs, { 'a.js': 'v2' }, 'rewinding two steps is what rewind means');
});

/*
 * THE FAILURE THIS WHOLE MODULE IS SHAPED AROUND.
 *
 * One tampered row must not produce a tree assembled from two moments. If the
 * per-step verification is ever removed "because the end hash covers it", the
 * end hash does NOT cover it: a chain can end at the right hash by luck of a
 * later step overwriting the damage, and cannot locate the break at all.
 */
test('a corrupted link refuses, names the checkpoint, and returns the last verified state', () => {
  let history = [];
  history = recordDeskCheckpoint(history, { 'a.js': 'good1' }, { label: 'one' });
  history = recordDeskCheckpoint(history, { 'a.js': 'good2' }, { label: 'two' });
  history = recordDeskCheckpoint(history, { 'a.js': 'good3' }, { label: 'three' });
  const { steps } = planDeskCheckpointChain(history);

  // The stored content of step two is damaged; its recorded hash still says
  // what the tree was supposed to be.
  const tampered = steps.map((step, i) => (
    i === 1 ? { ...step, delta: { ...step.delta, changed: { 'a.js': 'TAMPERED' } } } : step
  ));

  const replay = replayDeskCheckpointChain({ steps: tampered });
  assert.equal(replay.ok, false, 'a damaged chain must never report success');
  assert.equal(replay.brokeAt, steps[1].id, 'the caller has to be told WHICH checkpoint stopped being trustworthy');
  assert.equal(replay.verifiedSteps, 1);
  assert.deepEqual(replay.vfs, { 'a.js': 'good1' }, 'the tree handed back is the last one that verified, never a mixture');
  assert.match(replay.reason, /does not rebuild to the tree it recorded/);
  assert.doesNotMatch(String(replay.vfs['a.js']), /TAMPERED/, 'damaged content must not reach the caller');
});

test('a checkpoint with no hash is refused rather than trusted', () => {
  const replay = replayDeskCheckpointChain({
    steps: [{ id: 'ckpt_x', delta: { changed: { 'a.js': 'anything' }, removed: [] }, hash: null }],
  });
  assert.equal(replay.ok, false);
  assert.match(replay.reason, /carries no hash/);
  assert.deepEqual(replay.vfs, {}, 'an unverifiable step contributes nothing');
});

test('an empty chain replays to an empty tree without claiming a failure', () => {
  const replay = replayDeskCheckpointChain({});
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.vfs, {});
  assert.equal(replay.verifiedSteps, 0);
});

/*
 * A checkpoint is whole or absent. The checkout may hand back a partial tree
 * because a reading sample that reports its own gaps is still useful; a
 * checkpoint is what someone rewinds TO, so a partial one is a trap.
 */
test('a change too large to store is refused with its size, never truncated', () => {
  const huge = { 'big.js': 'x'.repeat(DELTA_MAX_BYTES + 1) };
  const verdict = deskDeltaStorable(deskVfsDelta({}, huge));
  assert.equal(verdict.ok, false);
  assert.ok(verdict.bytes > DELTA_MAX_BYTES);
  assert.match(verdict.reason, /KB/, 'a person told only "too big" cannot act on it');

  const small = deskDeltaStorable(deskVfsDelta({}, { 'a.js': 'tiny' }));
  assert.equal(small.ok, true);
});

test('an oversized entry stops the chain at itself, leaving a chain that still replays whole', () => {
  let history = [];
  history = recordDeskCheckpoint(history, { 'a.js': 'small' }, { label: 'fine' });
  history = recordDeskCheckpoint(history, { 'a.js': 'small', 'big.js': 'y'.repeat(DELTA_MAX_BYTES + 1) }, { label: 'huge' });

  const plan = planDeskCheckpointChain(history);
  assert.equal(plan.stoppedAt, history[1].id, 'the caller is told exactly which checkpoint could not be kept');
  assert.equal(plan.steps.length, 1, 'the chain stops rather than storing a hole');

  const replay = replayDeskCheckpointChain({ steps: plan.steps });
  assert.equal(replay.ok, true, 'what was stored must still replay whole');
  assert.deepEqual(replay.vfs, { 'a.js': 'small' });
});

test('the hash a chain records is the same identity the in-memory history uses', () => {
  const vfs = { 'a.js': 'one', 'b.js': 'two' };
  const { steps } = planDeskCheckpointChain(recordDeskCheckpoint([], vfs, { label: 'only' }));
  assert.equal(
    steps[0].hash,
    hashVfsContent(vfs),
    'two definitions of "same tree" would eventually disagree, and the restore would refuse a good chain',
  );
});

/*
 * Rows come from a database, and databases lose rows. A chain that just sorts
 * whatever arrived would apply the wrong delta to the wrong tree and then
 * blame an intact checkpoint for the mismatch, sending anyone debugging it to
 * the wrong place entirely.
 */
test('a hole in the stored history is found before replay, and named where it is', () => {
  const rows = [
    { checkpoint_id: 'ckpt_a', seq: 0, hash: 'aaaa', delta: { changed: { 'a.js': '1' }, removed: [] } },
    { checkpoint_id: 'ckpt_c', seq: 2, hash: 'cccc', delta: { changed: { 'a.js': '3' }, removed: [] } },
  ];
  const chain = deskCheckpointStepsFromRows(rows);
  assert.equal(chain.ok, false, 'a missing row must not read as a shorter history');
  assert.match(chain.reason, /jumps from position 0 to 2/);
  assert.match(chain.reason, /ckpt_c/);
  assert.equal(chain.steps.length, 1, 'what survives is the part before the hole');
});

test('rows arriving out of order are still a valid chain', () => {
  const rows = [
    { checkpoint_id: 'ckpt_b', seq: 1, hash: 'b', delta: {} },
    { checkpoint_id: 'ckpt_a', seq: 0, hash: 'a', delta: {} },
  ];
  const chain = deskCheckpointStepsFromRows(rows);
  assert.equal(chain.ok, true, chain.reason);
  assert.deepEqual(chain.steps.map((s) => s.id), ['ckpt_a', 'ckpt_b']);
});

/*
 * THE POINT OF THE WHOLE PHASE: the work outlives the thing that was editing it.
 * Nothing in-process is carried across this boundary -- only rows, exactly as a
 * database would hand them back to a different machine tomorrow.
 */
test('a session rebuilt from stored rows alone is the session that was lost', () => {
  let history = [];
  history = recordDeskCheckpoint(history, { 'index.html': '<h1>draft</h1>' }, { label: 'first draft' });
  history = recordDeskCheckpoint(history, { 'index.html': '<h1>draft</h1>', 'style.css': 'body{color:red}' }, { label: 'styled' });
  history = recordDeskCheckpoint(history, { 'index.html': '<h1>final</h1>', 'style.css': 'body{color:red}' }, { label: 'final copy' });
  const live = history[history.length - 1].vfs;

  // Everything that would be written to a row, and nothing else.
  const rows = planDeskCheckpointChain(history).steps.map((step, seq) => JSON.parse(JSON.stringify({
    checkpoint_id: step.id,
    seq,
    label: step.label,
    origin: step.origin,
    hash: step.hash,
    delta: step.delta,
  })));

  // The desk, the session and every object above are now gone.
  history = null;

  const chain = deskCheckpointStepsFromRows(rows);
  assert.equal(chain.ok, true, chain.reason);
  const replay = replayDeskCheckpointChain({ steps: chain.steps });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.vfs, live, 'the restored tree is the tree the desk had when it died');
  assert.equal(replay.verifiedSteps, 3);
});

/*
 * FROM REVIEW OF #591, the highest-severity finding.
 *
 * The desk trims its own history at twenty entries and renumbers what remains,
 * so checkpoint 21 arrives claiming position 0 -- the position the dropped one
 * still held. Merging rows by id alone leaves two at the same position, and the
 * chain is then refused on every read from that moment on, permanently. The
 * store replaces a session's chain per generation rather than adding to it;
 * this holds the shape that makes the replacement necessary.
 */
test('a trimmed history is a complete chain in its own right, not a continuation', () => {
  let history = [];
  for (const body of ['v1', 'v2', 'v3']) {
    history = recordDeskCheckpoint(history, { 'a.js': body }, { label: body });
  }
  // What the desk keeps after dropping its oldest entry.
  const trimmed = history.slice(1);
  const plan = planDeskCheckpointChain(trimmed);

  assert.equal(plan.steps[0].delta.removed.length, 0);
  assert.deepEqual(
    plan.steps[0].delta.changed,
    { 'a.js': 'v2' },
    'the first surviving checkpoint must carry a whole tree, since nothing precedes it any more',
  );
  const replay = replayDeskCheckpointChain({ steps: plan.steps });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.vfs, { 'a.js': 'v3' }, 'a trimmed chain still replays to the live tree');
});

test('two chains written for one session would collide at position zero', () => {
  let history = [];
  for (const body of ['v1', 'v2']) history = recordDeskCheckpoint(history, { 'a.js': body }, { label: body });
  const first = planDeskCheckpointChain(history).steps.map((s, seq) => ({ checkpoint_id: s.id, seq, hash: s.hash, delta: s.delta }));
  const second = planDeskCheckpointChain(history.slice(1)).steps.map((s, seq) => ({ checkpoint_id: s.id, seq, hash: s.hash, delta: s.delta }));

  // Exactly what merging by id into one set of rows would produce.
  const merged = deskCheckpointStepsFromRows([...first, ...second]);
  assert.equal(merged.ok, false, 'two generations in one set must be refused, not silently replayed');

  // And each generation on its own is fine, which is why the store keeps them apart.
  assert.equal(deskCheckpointStepsFromRows(first).ok, true);
  assert.equal(deskCheckpointStepsFromRows(second).ok, true);
});

/*
 * ALSO FROM REVIEW OF #591: the durable history has to reach the rewind menu,
 * in the shape the menu and planDeskRestore already work on.
 */
test('a stored chain hydrates into the history the desk would have built itself', () => {
  let history = [];
  history = recordDeskCheckpoint(history, { 'index.html': 'one' }, { label: 'first' });
  history = recordDeskCheckpoint(history, { 'index.html': 'two', 'app.css': 'x' }, { label: 'second' });
  const steps = planDeskCheckpointChain(history).steps;

  const hydrated = hydrateDeskCheckpointHistory(steps);
  assert.equal(hydrated.ok, true, hydrated.reason);
  assert.equal(hydrated.entries.length, 2);
  assert.deepEqual(hydrated.entries[0].vfs, { 'index.html': 'one' }, 'every entry carries its whole tree, as the menu needs');
  assert.deepEqual(hydrated.entries[1].vfs, { 'index.html': 'two', 'app.css': 'x' });
  assert.equal(hydrated.entries[1].label, 'second', 'the labels a person chose survive the round trip');
  assert.equal(hydrated.entries[1].fileCount, 2);

  // The restore machinery must accept it without knowing it came from a server.
  const plan = planDeskRestore(hydrated.entries, hydrated.entries[0].id, hydrated.entries[1].vfs);
  assert.equal(plan.ok, true, `a hydrated history must be restorable: ${plan.reason || ''}`);
  // A checkpoint STORES text; a restore hands back what the desk renders, so
  // the file tree can list the files the rewind just brought back.
  assert.deepEqual(plan.vfs, { 'index.html': { content: 'one', language: 'html' } });
});

test('hydration refuses a tampered chain rather than offering a restore point that lies', () => {
  let history = [];
  history = recordDeskCheckpoint(history, { 'a.js': 'good' }, { label: 'good' });
  history = recordDeskCheckpoint(history, { 'a.js': 'also good' }, { label: 'also good' });
  const steps = planDeskCheckpointChain(history).steps;
  const tampered = steps.map((s, i) => (i === 1 ? { ...s, delta: { changed: { 'a.js': 'TAMPERED' }, removed: [] } } : s));

  const hydrated = hydrateDeskCheckpointHistory(tampered);
  assert.equal(hydrated.ok, false, 'a chain that does not rebuild must not become a rewind menu');
  assert.equal(hydrated.entries.length, 1, 'what verified is kept, what did not is dropped');
  assert.deepEqual(hydrated.entries[0].vfs, { 'a.js': 'good' });
  assert.match(hydrated.reason, /does not rebuild to the tree it recorded/);
});
