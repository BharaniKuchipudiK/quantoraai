import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_SYNC_MAX_FILES,
  isDeskGitAction,
  isValidDeskCommand,
  isValidWorkspaceRelativePath,
  validateDeskSyncEntries,
} from './desk-runtime-contract.js';

test('workspace-relative paths are plain forward-slash paths inside the folder', () => {
  assert.equal(isValidWorkspaceRelativePath('index.html'), true);
  assert.equal(isValidWorkspaceRelativePath('src/App.jsx'), true);
  assert.equal(isValidWorkspaceRelativePath('.env'), true);
  for (const bad of ['', '/abs', 'a/../b', '../x', './x', 'a//b', 'a\\b', 'C:/x', 'a\0b', 'x/', 'a/./b']) {
    assert.equal(isValidWorkspaceRelativePath(bad), false, `rejects ${JSON.stringify(bad)}`);
  }
});

test('a desk command is non-empty text under the length cap with no NUL', () => {
  assert.equal(isValidDeskCommand('ls -la'), true);
  assert.equal(isValidDeskCommand('   '), false);
  assert.equal(isValidDeskCommand('x'.repeat(5000)), false);
  assert.equal(isValidDeskCommand('echo \0'), false);
  assert.equal(isValidDeskCommand(42), false);
});

test('git actions are the four the desk offers', () => {
  for (const action of ['init', 'status', 'diff', 'commit']) assert.equal(isDeskGitAction(action), true);
  assert.equal(isDeskGitAction('push'), false, 'desk git never pushes');
  assert.equal(isDeskGitAction('rebase'), false);
});

test('a sync batch is accepted whole or refused whole', () => {
  assert.deepEqual(
    validateDeskSyncEntries([{ path: 'a.txt', content: 'A' }, { path: 'dir/b.txt', content: 'B' }]),
    { ok: true, entries: [{ path: 'a.txt', content: 'A' }, { path: 'dir/b.txt', content: 'B' }] },
  );
  assert.equal(validateDeskSyncEntries([{ path: 'ok.txt', content: 'x' }, { path: '../evil', content: 'x' }]).ok, false);
  assert.equal(validateDeskSyncEntries([{ path: 'a', content: 1 }]).ok, false);
  assert.equal(validateDeskSyncEntries([{ path: 'a', content: 'x' }, { path: 'a', content: 'y' }]).ok, false, 'duplicates refused');
  assert.equal(validateDeskSyncEntries('nope').ok, false);
  const tooMany = Array.from({ length: DESK_SYNC_MAX_FILES + 1 }, (_, i) => ({ path: `f${i}`, content: '' }));
  assert.equal(validateDeskSyncEntries(tooMany).ok, false);
});
