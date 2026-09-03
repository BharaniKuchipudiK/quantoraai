/**
 * A working copy knows what it is a copy of.
 *
 * Before this, opening a repository and running status reported every file in
 * the project as untracked. That is technically true of an empty in-memory repo
 * and useless as an answer — the honest one is "nothing has changed yet". The
 * tests below are about that: a baseline the desk received from a real commit,
 * and what it must never do when it did not receive one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deskGitBase,
  deskGitStatusHeader,
  resetDeskGitRepos,
  runDeskGit,
  seedDeskRepoFromCheckout,
} from './studio-git.js';

const checkout = [
  { path: 'index.html', content: '<h1>hi</h1>' },
  { path: 'src/app.js', content: 'export const a = 1;' },
];

// The desk stores entries as objects, not strings — the shape this suite exists to police.
const asVfs = (files) => Object.fromEntries(files.map((file) => [file.path, { content: file.content }]));

test.beforeEach(() => resetDeskGitRepos());

test('status right after opening a repository reports a clean tree', () => {
  seedDeskRepoFromCheckout('ws', checkout, { commitSha: 'abc1234def', branch: 'main', repository: 'octo/widget' });
  const result = runDeskGit(asVfs(checkout), { action: 'status', workspaceKey: 'ws' });

  assert.equal(result.ok, true);
  assert.match(result.output, /working tree clean/);
  assert.doesNotMatch(result.output, /\?\?/, 'nothing was changed, so nothing is untracked');
});

test('the status header names the commit the desk is working from', () => {
  seedDeskRepoFromCheckout('ws', checkout, { commitSha: 'abc1234def', branch: 'main', repository: 'octo/widget' });
  const result = runDeskGit(asVfs(checkout), { action: 'status', workspaceKey: 'ws' });

  // "modified" means nothing until the reader knows what it is modified from.
  assert.match(result.output, /octo\/widget main\.\.\.abc1234/);
});

test('an edit after opening shows as modified, not as new', () => {
  seedDeskRepoFromCheckout('ws', checkout, { commitSha: 'abc1234def', branch: 'main', repository: 'octo/widget' });
  const edited = { ...asVfs(checkout), 'src/app.js': { content: 'export const a = 2;' } };
  const result = runDeskGit(edited, { action: 'status', workspaceKey: 'ws' });

  assert.match(result.output, / M src\/app\.js/);
  assert.doesNotMatch(result.output, /\?\? src\/app\.js/);
});

test('a file added after opening shows as untracked, and a deleted one as deleted', () => {
  seedDeskRepoFromCheckout('ws', checkout, { commitSha: 'abc1234def', branch: 'main', repository: 'octo/widget' });
  const changed = { 'index.html': { content: '<h1>hi</h1>' }, 'src/new.js': { content: 'new' } };
  const result = runDeskGit(changed, { action: 'status', workspaceKey: 'ws' });

  assert.match(result.output, /\?\? src\/new\.js/);
  assert.match(result.output, / D src\/app\.js/);
});

test('diff after opening shows the changed lines, not a file list', () => {
  seedDeskRepoFromCheckout('ws', checkout, { commitSha: 'abc1234def', branch: 'main', repository: 'octo/widget' });
  const edited = { ...asVfs(checkout), 'src/app.js': { content: 'export const a = 2;' } };
  const result = runDeskGit(edited, { action: 'diff', workspaceKey: 'ws' });

  assert.match(result.output, /-export const a = 1;/);
  assert.match(result.output, /\+export const a = 2;/);
});

test('an empty checkout is refused rather than becoming an empty baseline', () => {
  const seeded = seedDeskRepoFromCheckout('ws', [], { commitSha: 'abc1234def', branch: 'main' });
  assert.equal(seeded, false);
  assert.equal(deskGitBase('ws'), null);
  // Otherwise the next status would call the user's whole project newly added.
});

test('a generated build has no origin, and the header does not invent one', () => {
  assert.equal(deskGitStatusHeader(null), '## desk');
  assert.equal(deskGitStatusHeader({ branch: 'main' }), '## desk', 'a branch without a commit is not a base');
  assert.equal(deskGitBase('never-opened'), null);
});

test('the base survives edits, because it describes where the files came from', () => {
  seedDeskRepoFromCheckout('ws', checkout, { commitSha: 'abc1234def', branch: 'trunk', repository: 'octo/widget' });
  runDeskGit({ ...asVfs(checkout), 'src/app.js': { content: 'changed' } }, { action: 'status', workspaceKey: 'ws' });

  const base = deskGitBase('ws');
  assert.equal(base.commitSha, 'abc1234def');
  assert.equal(base.branch, 'trunk');
});
