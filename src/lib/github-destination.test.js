/**
 * The destination chosen before the work starts.
 *
 * The property worth testing here is not that the chips render — it is that
 * "no repository" survives as a real answer, and that a repository the user
 * cannot write to is called out BEFORE the build rather than at the push. The
 * second one is the whole reason the bar exists: read-only access discovered
 * after a build has already happened costs the build.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  githubDestinationBlocker,
  githubDestinationChips,
  githubDestinationRepoUrl,
  normalizeGithubDestination,
} from './github-workspace.js';

const connected = { connected: true, login: 'octo' };

test('no destination is a real answer, not a broken one', () => {
  assert.equal(normalizeGithubDestination(null), null);
  assert.equal(normalizeGithubDestination({}), null);
  assert.equal(normalizeGithubDestination({ owner: 'octo' }), null, 'an owner with no repo is not a destination');
  assert.equal(githubDestinationRepoUrl(null), '');
});

test('a destination defaults its branch to the repository default', () => {
  const target = normalizeGithubDestination({ owner: 'octo', repo: 'widget', defaultBranch: 'trunk' });
  assert.equal(target.branch, 'trunk');
  assert.equal(githubDestinationRepoUrl(target), 'https://github.com/octo/widget');
});

test('a repository with no stated default branch falls back to main', () => {
  const target = normalizeGithubDestination({ owner: 'octo', repo: 'widget' });
  assert.equal(target.defaultBranch, 'main');
  assert.equal(target.branch, 'main');
});

test('an explicitly chosen branch is kept over the default', () => {
  const target = normalizeGithubDestination({ owner: 'octo', repo: 'widget', defaultBranch: 'main', branch: 'feature' });
  assert.equal(target.branch, 'feature');
});

test('a disconnected account is asked to connect, not shown empty slots', () => {
  const chips = githubDestinationChips(null, { connected: false });
  assert.equal(chips.length, 1);
  assert.equal(chips[0].id, 'connect');
});

test('connected with no repository reads as a choice not yet made', () => {
  const chips = githubDestinationChips(null, connected);
  assert.deepEqual(chips.map((chip) => chip.id), ['owner', 'repo']);
  assert.equal(chips[1].label, 'No repository');
  // No branch chip: there is no repository for a branch to belong to.
});

test('a chosen destination reads owner, repository, branch in that order', () => {
  const target = { owner: 'octo', repo: 'widget', defaultBranch: 'main', branch: 'feature', canPush: true };
  const chips = githubDestinationChips(target, connected);
  assert.deepEqual(chips.map((chip) => chip.label), ['octo', 'widget', 'feature']);
});

test('read-only access is flagged before the build, not at the push', () => {
  const readOnly = { owner: 'acme', repo: 'widget', defaultBranch: 'main', canPush: false };
  const blocker = githubDestinationBlocker(readOnly);
  assert.match(blocker, /read access/);
  assert.match(blocker, /never save it/, 'the cost of finding out late has to be stated');

  const chips = githubDestinationChips(readOnly, connected);
  assert.equal(chips[1].tone, 'warn', 'a repository that cannot receive the build must not look ready');
});

test('a writable destination raises no blocker', () => {
  assert.equal(githubDestinationBlocker({ owner: 'octo', repo: 'widget', canPush: true }), '');
  assert.equal(githubDestinationBlocker(null), '', 'choosing nothing is not an error');
});
