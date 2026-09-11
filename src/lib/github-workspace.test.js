import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GITHUB_CONNECT_URL,
  GITHUB_ENDPOINTS,
  buildGithubStageBody,
  checkStateLabel,
  githubConnectionNotice,
  githubReconnectPrompt,
  isGithubTokenRejected,
  mergeBlockedReason,
  parseGithubConnectReturn,
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

/*
 * The rejection this pair exists for. The server's sentence is the anchor —
 * matching on "401" or "token" would offer a reconnect after failures a
 * reconnect cannot fix, and a remedy that does not work is worse than none.
 */
test('a rejected token is recognised from the server sentence, and nothing else is', () => {
  assert.equal(
    isGithubTokenRejected('GitHub rejected your connected token. Reconnect your GitHub account in Quantora.'),
    true,
  );
  for (const other of [
    'That did not complete (HTTP 500).',
    'GitHub could not confirm your access to a/b (HTTP 403). No action was taken.',
    'bharanikh-design/quantoraai is not visible to your connected GitHub account.',
    'You have read access to a/b, not write.',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isGithubTokenRejected(other), false, String(other));
  }
});

test('the reconnect prompt points at the connect route, not at prose', () => {
  const prompt = githubReconnectPrompt();
  assert.equal(prompt.href, GITHUB_CONNECT_URL);
  assert.ok(prompt.action.length > 0);
  // The old copy told the reader to reconnect "in Quantora" and gave them
  // nowhere to do it. The prompt carries the destination itself.
  assert.match(prompt.href, /^\/api\//);
});

// The connect flow always redirects back to `/?github=…`. Before this was
// wired up, nothing in the app read that query string: a real refusal from
// the server ("Sign in to Quantora before connecting GitHub.") landed on the
// home page and was thrown away, so clicking the still-disconnected chip
// again reproduced the identical silent bounce — read by a real user as an
// infinite loop, not as the one-line answer the server had already given.

test('a bare visit carries no connect notice', () => {
  assert.deepEqual(parseGithubConnectReturn(''), { present: false, tone: '', message: '' });
  assert.deepEqual(parseGithubConnectReturn('?auth=success'), { present: false, tone: '', message: '' });
});

test('a successful connect names who was connected', () => {
  const result = parseGithubConnectReturn('?github=connected&login=octocat');
  assert.equal(result.present, true);
  assert.equal(result.tone, 'good');
  assert.match(result.message, /octocat/);
});

test('a successful connect with no login still reads as success', () => {
  const result = parseGithubConnectReturn('?github=connected');
  assert.equal(result.present, true);
  assert.equal(result.tone, 'good');
  assert.match(result.message, /connected/i);
});

test('a failed connect surfaces the exact server message, not a generic one', () => {
  const message = 'Sign in to Quantora before connecting GitHub.';
  const result = parseGithubConnectReturn(`?github=error&message=${encodeURIComponent(message)}`);
  assert.equal(result.present, true);
  assert.equal(result.tone, 'bad');
  assert.equal(result.message, message);
});

test('a failed connect with no message still reads as an error, not nothing', () => {
  const result = parseGithubConnectReturn('?github=error');
  assert.equal(result.present, true);
  assert.equal(result.tone, 'bad');
  assert.ok(result.message.length > 0);
});
