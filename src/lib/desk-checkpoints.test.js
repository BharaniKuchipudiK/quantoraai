import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESK_CHECKPOINT_BYTE_BUDGET,
  DESK_CHECKPOINT_LIMIT,
  describeDeskCheckpoints,
  hashVfsContent,
  planDeskRestore,
  recordDeskCheckpoint,
  vfsFileText,
} from './desk-checkpoints.js';

const site = (headline) => ({
  'index.html': `<html><body><h1>${headline}</h1></body></html>`,
  'style.css': 'h1 { font-weight: 700; }',
});

test('each accepted commit becomes a restore point, identical states do not', () => {
  let history = recordDeskCheckpoint([], site('v1'), { label: 'First build' });
  history = recordDeskCheckpoint(history, site('v1'), { label: 'Re-render, no change' });
  history = recordDeskCheckpoint(history, site('v2'), { label: 'Hero rewrite' });
  assert.equal(history.length, 2);
  assert.equal(history[0].label, 'First build');
  assert.equal(history[1].label, 'Hero rewrite');
});

test('an empty workspace never records a checkpoint', () => {
  assert.equal(recordDeskCheckpoint([], {}).length, 0);
  assert.equal(recordDeskCheckpoint([], null).length, 0);
});

test('rewind returns the old files and preserves the current state first', () => {
  let history = recordDeskCheckpoint([], site('working'), { label: 'Working site' });
  const broken = { 'index.html': '<html><body>half-finished' };
  history = recordDeskCheckpoint(history, broken, { label: 'Bad edit' });

  const plan = planDeskRestore(history, history[0].id, broken);
  assert.equal(plan.ok, true);
  // Restored in the shape the desk renders, never as bare text: the file tree
  // lists nothing for an entry without `.content`.
  assert.match(plan.vfs['index.html'].content, /working/);
  assert.equal(plan.vfs['index.html'].language, 'html');
  // The bad state survives as its own checkpoint, so the rewind is undoable.
  assert.equal(plan.history[plan.history.length - 1].hash, hashVfsContent(broken));
});

test('restoring the state already on the desk is refused', () => {
  const current = site('v1');
  const history = recordDeskCheckpoint([], current, { label: 'First build' });
  const plan = planDeskRestore(history, history[0].id, current);
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'already_current');
});

test('an unknown checkpoint id is refused, not thrown', () => {
  const history = recordDeskCheckpoint([], site('v1'));
  assert.equal(planDeskRestore(history, 'ckpt_missing', site('v2')).ok, false);
});

test('history is bounded by count and bytes but always keeps a restore point', () => {
  let history = [];
  for (let i = 0; i < DESK_CHECKPOINT_LIMIT + 10; i += 1) {
    history = recordDeskCheckpoint(history, site(`v${i}`), { label: `v${i}` });
  }
  assert.equal(history.length, DESK_CHECKPOINT_LIMIT);
  assert.equal(history[history.length - 1].label, `v${DESK_CHECKPOINT_LIMIT + 9}`);

  const huge = { 'index.html': 'x'.repeat(DESK_CHECKPOINT_BYTE_BUDGET + 1000) };
  history = recordDeskCheckpoint(history, huge, { label: 'One giant build' });
  assert.equal(history.length, 1);
  assert.equal(history[0].label, 'One giant build');
});

test('the menu lists newest first and marks the state currently on the desk', () => {
  let history = recordDeskCheckpoint([], site('v1'), { label: 'First build', at: 1000 });
  history = recordDeskCheckpoint(history, site('v2'), { label: 'Hero rewrite', at: 2000 });
  const rows = describeDeskCheckpoints(history, site('v2'));
  assert.equal(rows[0].label, 'Hero rewrite');
  assert.equal(rows[0].isCurrent, true);
  assert.equal(rows[1].isCurrent, false);
});

test('non-string file bodies are ignored rather than snapshotted', () => {
  const history = recordDeskCheckpoint([], { 'index.html': '<html/>', junk: { nested: true } });
  assert.deepEqual(Object.keys(history[0].vfs), ['index.html']);
});


/*
 * ---------------------------------------------------------------------------
 * THE SHAPE THE DESK ACTUALLY USES.
 *
 * Every test above passes a bare-string VFS, and that is why this family
 * shipped broken: the desk stores `{ content, language }`, snapshotVfs kept
 * only strings, so a real desk snapshotted to `{}` and recordDeskCheckpoint
 * returned the history unchanged. No checkpoint was ever recorded, and the
 * Rewind control -- which renders only when there are checkpoints -- never
 * appeared. A whole tested, durable, argued-about rollback feature, unreachable
 * from the button.
 *
 * String fixtures alone cannot catch that. These use the real shape.
 * ---------------------------------------------------------------------------
 */
const deskSite = (headline) => ({
  'index.html': { content: `<html><body><h1>${headline}</h1></body></html>`, language: 'html' },
  'style.css': { content: 'h1 { font-weight: 700; }', language: 'css' },
});

test('a desk-shaped workspace records a checkpoint', () => {
  const history = recordDeskCheckpoint([], deskSite('v1'), { label: 'First build' });
  assert.equal(history.length, 1, 'the shape the desk actually stores produced no checkpoint, so Rewind will never appear');
  assert.equal(history[0].fileCount, 2);
});

test('the two shapes of the same content are the same checkpoint', () => {
  assert.equal(
    hashVfsContent(deskSite('v1')),
    hashVfsContent(site('v1')),
    'the same files read as two different trees depending on how they are held',
  );
  const history = recordDeskCheckpoint([], deskSite('v1'), { label: 'First' });
  assert.equal(
    recordDeskCheckpoint(history, site('v1'), { label: 'Same content, other shape' }).length,
    1,
    'a re-render in the other shape was recorded as a change',
  );
});

test('rewinding a desk-shaped workspace returns files the tree can list', () => {
  let history = recordDeskCheckpoint([], deskSite('working'), { label: 'Working site' });
  const broken = { 'index.html': { content: '<html><body>half-finished', language: 'html' } };
  history = recordDeskCheckpoint(history, broken, { label: 'Bad edit' });
  assert.equal(history.length, 2, 'two desk-shaped commits did not produce two checkpoints');

  const plan = planDeskRestore(history, history[0].id, broken);
  assert.equal(plan.ok, true);
  for (const [path, entry] of Object.entries(plan.vfs)) {
    assert.equal(typeof entry.content, 'string', `${path} came back without .content, so the file tree would not list it`);
  }
  assert.match(plan.vfs['index.html'].content, /working/);
  assert.equal(plan.vfs['style.css'].language, 'css');
});

test('a file is read whichever way it is held, and nothing else is', () => {
  assert.equal(vfsFileText('raw text'), 'raw text');
  assert.equal(vfsFileText({ content: 'held text', language: 'js' }), 'held text');
  for (const notAFile of [null, undefined, 42, {}, { content: 7 }, []]) {
    assert.equal(vfsFileText(notAFile), null, `${JSON.stringify(notAFile)} is not a file`);
  }
});
