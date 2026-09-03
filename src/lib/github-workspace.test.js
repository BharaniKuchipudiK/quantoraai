import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GITHUB_ENDPOINTS,
  buildGithubStageBody,
  checkStateLabel,
  githubConnectionNotice,
  mergeBlockedReason,
  pullRequestStateLabel,
} from './github-workspace.js';

test('every endpoint maps to a stage, so no control posts a body the server cannot route', () => {
  for (const endpoint of Object.values(GITHUB_ENDPOINTS)) {
    const body = buildGithubStageBody(endpoint, { repoUrl: 'https://github.com/acme/widget' });
    assert.match(body.targetStage, /^github-/);
    assert.equal(body.repoUrl, 'https://github.com/acme/widget');
  }
  assert.throws(() => buildGithubStageBody('/api/github/invented'), /No GitHub stage/);
});

test('no checks is never presented as a pass', () => {
  assert.equal(checkStateLabel('none').tone, 'unknown');
  assert.match(checkStateLabel('none').text, /No checks ran/);
  assert.equal(checkStateLabel(undefined).tone, 'unknown');
  assert.equal(checkStateLabel('failing').tone, 'bad');
  assert.equal(checkStateLabel('pending').tone, 'wait');
  // Even the good case points at the evidence rather than declaring it proven.
  assert.match(checkStateLabel('passing').text, /open the logs/i);
});

test('a merged pull request is labelled merged, not closed', () => {
  assert.equal(pullRequestStateLabel({ state: 'merged' }), 'merged');
  assert.equal(pullRequestStateLabel({ state: 'closed' }), 'closed');
  assert.equal(pullRequestStateLabel({ state: 'open', draft: true }), 'draft');
  assert.equal(pullRequestStateLabel({ state: 'open', draft: false }), 'open');
  assert.equal(pullRequestStateLabel(null), '');
});

test('a partial GitHub grant is explained before it causes a refusal', () => {
  assert.equal(githubConnectionNotice({ connected: true, login: 'octo', scopes: ['repo', 'read:user'] }), '');
  const partial = githubConnectionNotice({ connected: true, login: 'octo', scopes: ['read:user'] });
  assert.match(partial, /granted only/);
  assert.match(partial, /repo/);
  assert.match(githubConnectionNotice({ connected: false }), /Connect your GitHub account/);
  // A configuration problem must surface as itself, not as "not connected yet".
  assert.match(
    githubConnectionNotice({ connected: false, reason: 'GITHUB_CONNECTION_SECRET must be at least 32 characters.' }),
    /GITHUB_CONNECTION_SECRET/,
  );
});

test('merge is blocked on the states a reviewer should never merge through', () => {
  const green = { summary: { state: 'open', headSha: 'abc123', mergeable: true }, checks: { state: 'passing' } };
  assert.equal(mergeBlockedReason(green), '');
  assert.match(mergeBlockedReason({ ...green, checks: { state: 'failing' } }), /CI is failing/);
  assert.match(mergeBlockedReason({ ...green, summary: { ...green.summary, mergeable: false } }), /conflicts/);
  assert.match(mergeBlockedReason({ ...green, summary: { ...green.summary, state: 'closed' } }), /closed/);
  assert.match(mergeBlockedReason(null), /Open a pull request first/);

  // mergeable === null means GitHub has not finished computing. That is not a
  // conflict, and blocking on it would invent one.
  assert.equal(mergeBlockedReason({ ...green, summary: { ...green.summary, mergeable: null } }), '');
});
