import assert from 'node:assert/strict';
import test from 'node:test';
import {
  looksLikeMissingGitRepo,
  normalizeStudioGitAction,
  normalizeStudioGitCommitMessage,
  resetDeskGitRepos,
  runDeskGit,
  studioGitArgv,
  studioGitBlocker,
} from './studio-git.js';
import { deskShellVfs } from './studio-workspace-tree.js';

const calculator = `
import React, { useState } from 'react';
export default function Calculator() {
  const [value, setValue] = useState('0');
  return <main><output data-testid="calculator-display">{value}</output></main>;
}
`;

const boutique = {
  'index.html': { content: '<!DOCTYPE html><html><body><div class="product-card">Silk</div></body></html>', language: 'html' },
  'products.json': { content: '[]', language: 'json' },
};

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

test('Git status expands a raw chat App.jsx to the Preview tree', () => {
  resetDeskGitRepos();
  const status = runDeskGit({ 'App.jsx': { content: calculator, language: 'jsx' } }, { action: 'status', workspaceKey: 'raw' });
  assert.equal(status.ok, true);
  assert.match(status.output, /index\.html/);
  assert.match(status.output, /src\/App\.jsx/);
});

test('Git status on a calculator lists the Preview tree, not a lone App.jsx', () => {
  resetDeskGitRepos();
  const vfs = deskShellVfs({ 'App.jsx': { content: calculator, language: 'jsx' } }, calculator);
  const status = runDeskGit(vfs, { action: 'status', workspaceKey: 'calc' });
  assert.equal(status.ok, true);
  assert.match(status.output, /index\.html/);
  assert.match(status.output, /src\/App\.jsx/);
  assert.match(status.output, /\?\? /);
});

test('Git status on a boutique stays the boutique files', () => {
  resetDeskGitRepos();
  const status = runDeskGit(boutique, { action: 'status', workspaceKey: 'shop' });
  assert.equal(status.ok, true);
  assert.match(status.output, /index\.html/);
  assert.match(status.output, /products\.json/);
  assert.equal(/src\/App\.jsx/.test(status.output), false);
});

test('Git commit records the Preview files and then status is clean', () => {
  resetDeskGitRepos();
  const vfs = deskShellVfs({ 'App.jsx': { content: calculator, language: 'jsx' } }, calculator);
  const commit = runDeskGit(vfs, { action: 'commit', message: 'save the calculator', workspaceKey: 'calc-commit' });
  assert.equal(commit.ok, true);
  assert.match(commit.output, /save the calculator/);
  assert.match(commit.output, /index\.html/);
  const status = runDeskGit(vfs, { action: 'status', workspaceKey: 'calc-commit' });
  assert.match(status.output, /working tree clean/);
});

test('Git does not invent a status when the Preview tree is empty', () => {
  resetDeskGitRepos();
  const empty = runDeskGit({}, { action: 'status', workspaceKey: 'empty' });
  assert.equal(empty.ok, false);
  assert.match(empty.output, /empty/i);
});

test('changing chats drops the previous desk repo', () => {
  resetDeskGitRepos();
  const vfs = deskShellVfs({ 'App.jsx': { content: calculator, language: 'jsx' } }, calculator);
  assert.equal(runDeskGit(vfs, { action: 'commit', message: 'save one', workspaceKey: 'a' }).ok, true);
  const other = runDeskGit(vfs, { action: 'status', workspaceKey: 'b' });
  assert.match(other.output, /\?\? /);
});
