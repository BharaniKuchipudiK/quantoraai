/**
 * Client contract for Quantora's principal-bound GitHub surface.
 *
 * The endpoints below all resolve to /api/pipeline via vercel.json rewrites;
 * they are spelled out here so a control cannot drift from the route that
 * serves it (scripts/platform-dead-control-gate.mjs checks exactly that).
 *
 * Nothing here holds a token. The browser never sees one: the connect flow is
 * a server redirect, and the user's GitHub authorization lives sealed in the
 * database. That is the point — a token in the browser is a token an XSS bug
 * can exfiltrate.
 */

export const GITHUB_CONNECT_URL = '/api/auth/github/connect';

export const GITHUB_ENDPOINTS = Object.freeze({
  connection: '/api/github/connection',
  disconnect: '/api/github/disconnect',
  listPullRequests: '/api/github/list-prs',
  readPullRequest: '/api/github/read-pr',
  listIssues: '/api/github/list-issues',
  comment: '/api/github/comment',
  createPullRequest: '/api/github/create-pr',
  mergePullRequest: '/api/github/merge-pr',
  push: '/api/github/push',
  createRepository: '/api/github/create-repo',
});

const STAGE_BY_ENDPOINT = Object.freeze({
  [GITHUB_ENDPOINTS.connection]: 'github-connection',
  [GITHUB_ENDPOINTS.disconnect]: 'github-disconnect',
  [GITHUB_ENDPOINTS.listPullRequests]: 'github-list-prs',
  [GITHUB_ENDPOINTS.readPullRequest]: 'github-read-pr',
  [GITHUB_ENDPOINTS.listIssues]: 'github-list-issues',
  [GITHUB_ENDPOINTS.comment]: 'github-comment',
  [GITHUB_ENDPOINTS.createPullRequest]: 'github-create-pr',
  [GITHUB_ENDPOINTS.mergePullRequest]: 'github-merge-pr',
  [GITHUB_ENDPOINTS.push]: 'github-push',
  [GITHUB_ENDPOINTS.createRepository]: 'github-create-repo',
});

/**
 * Always send targetStage explicitly. The rewrite carries `?github=…`, but a
 * direct POST to /api/pipeline has no query string, and a body that relies on
 * one is a request that works in production and not in dev.
 */
export function buildGithubStageBody(endpoint, payload = {}) {
  const targetStage = STAGE_BY_ENDPOINT[endpoint];
  if (!targetStage) throw new Error(`No GitHub stage is mapped to ${endpoint}.`);
  return { targetStage, ...payload };
}

/**
 * How a check verdict should read to a human.
 *
 * "No checks ran" is deliberately not styled as success, and its wording says
 * what is absent rather than implying everything is fine. A grey tick next to
 * an unverified commit is how a reviewer merges on evidence that never existed.
 */
export function checkStateLabel(state) {
  if (state === 'failing') return { text: 'CI failing', tone: 'bad' };
  if (state === 'pending') return { text: 'CI running', tone: 'wait' };
  if (state === 'passing') return { text: 'CI green — open the logs', tone: 'good' };
  return { text: 'No checks ran on this commit', tone: 'unknown' };
}

export function pullRequestStateLabel(pullRequest) {
  if (!pullRequest) return '';
  if (pullRequest.state === 'merged') return 'merged';
  if (pullRequest.state === 'closed') return 'closed';
  return pullRequest.draft ? 'draft' : 'open';
}

/**
 * The one sentence a user needs about their connection, or '' when connected
 * and healthy. Kept here rather than in JSX so both the panel and its test read
 * the same words.
 */
export function githubConnectionNotice(summary) {
  if (!summary || summary.connected !== true) {
    return summary?.reason
      || 'Connect your GitHub account to list pull requests, read diffs and checks, comment, and open pull requests as yourself.';
  }
  if (Array.isArray(summary.scopes) && summary.scopes.length && !summary.scopes.includes('repo')) {
    // GitHub can grant less than was asked for. Saying so now beats an
    // unexplained refusal later, on an action the user has already committed to.
    return `Connected as ${summary.login}, but GitHub granted only: ${summary.scopes.join(', ')}. Private repositories and writes need the "repo" scope — reconnect to grant it.`;
  }
  return '';
}

/** Merging requires the exact commit the user read. This is that check, client-side. */
export function mergeBlockedReason(brief) {
  if (!brief?.summary) return 'Open a pull request first.';
  if (brief.summary.state !== 'open') return `This pull request is ${brief.summary.state}.`;
  if (!brief.summary.headSha) return 'Quantora does not know which commit this pull request is on.';
  if (brief.summary.mergeable === false) return 'GitHub reports this branch conflicts with its base.';
  if (brief.checks?.state === 'failing') return 'CI is failing on this commit.';
  return '';
}

/**
 * The desk's files, shaped for a push.
 *
 * Binary-ish and generated paths are dropped rather than sent: node_modules and
 * dist are the two that would blow the size budget without adding anything a
 * reader of the repository wants, and a lockfile-sized diff is how a first
 * commit stops being reviewable.
 */
const PUSH_SKIP = /(^|\/)(node_modules|dist|build|coverage|\.git)(\/|$)/;

export function deskFilesForPush(entries = []) {
  return entries
    .filter((entry) => entry && typeof entry.path === 'string' && typeof entry.content === 'string')
    .filter((entry) => !PUSH_SKIP.test(entry.path))
    .map((entry) => ({ path: entry.path.replace(/^\/+/, ''), content: entry.content }));
}

/**
 * A repository name from whatever the user called this build.
 *
 * Falls back to a dated name rather than something generic: two builds called
 * "quantora-project" collide on the second push, and GitHub's error for that
 * ("name already exists") reads as a bug rather than a naming clash.
 */
export function suggestRepositoryName(seed = '') {
  const slug = String(seed || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (slug) return slug;
  const today = new Date().toISOString().slice(0, 10);
  return `quantora-build-${today}`;
}

/** What a completed push should say, without overclaiming what happened. */
export function pushOutcomeMessage(result = {}) {
  const files = Number(result.fileCount) || 0;
  const branch = String(result.branch || 'main');
  const noun = files === 1 ? 'file' : 'files';
  return result.createdBranch
    ? `Pushed ${files} ${noun} and created "${branch}".`
    : `Pushed ${files} ${noun} to "${branch}".`;
}
