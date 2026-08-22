import assert from 'node:assert/strict';
import test from 'node:test';
import {
  looksLikeMissingGitRepo,
  normalizeStudioGitAction,
  normalizeStudioGitCommitMessage,
  studioGitArgv,
  studioGitBlocker,
} from './studio-git.js';

test('git refuses to fake output when the page is not isolated', () => {
  assert.match(studioGitBlocker({ isolated: false, fileCount: 2 }), /cannot start/i);
});

test('git refuses to run with no project files', () => {
  assert.match(studioGitBlocker({ isolated: true, fileCount: 0 }), /No files/i);
});

test('git is allowed when files exist on an isolated page', () => {
  assert.equal(studioGitBlocker({ isolated: true, fileCount: 1 }), '');
});

test('rejects push, clone, and Quantora github actions', () => {
  assert.throws(() => normalizeStudioGitAction('push'), /Not Quantora/i);
  assert.throws(() => normalizeStudioGitAction('clone'), /Not Quantora/i);
  assert.throws(() => studioGitArgv('remote'), /Not Quantora/i);
});

test('commit requires a single-line message and never shells it', () => {
  assert.throws(() => normalizeStudioGitCommitMessage('  '), /message/i);
  assert.throws(() => studioGitArgv('commit', 'one\ntwo'), /single line/i);
  assert.deepEqual(studioGitArgv('commit', ' save the calculator '), [
    ['git', 'add', '-A'],
    ['git', 'commit', '-m', 'save the calculator'],
  ]);
});

test('status and diff are fixed git argv', () => {
  assert.deepEqual(studioGitArgv('status'), [['git', 'status', '--short', '--branch']]);
  assert.equal(studioGitArgv('diff')[0][0], 'git');
});

test('missing repo is detected from real git output', () => {
  assert.equal(looksLikeMissingGitRepo('fatal: not a git repository (or any of the parent directories): .git'), true);
  assert.equal(looksLikeMissingGitRepo('## main\n M src/App.jsx'), false);
});
