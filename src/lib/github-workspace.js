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

/*
 * A rejected token is not a failed action, and must not be shown as one.
 *
 * The server says "GitHub rejected your connected token. Reconnect your GitHub
 * account in Quantora." — and the destination menu rendered that as inert red
 * text, because `connection.connected` was still true. It was: the row exists
 * and its sealed token decrypts. readGithubConnectionSummary never asks GitHub
 * whether the token still WORKS, so the platform went on claiming a connection
 * GitHub had already refused, while naming a remedy the panel gave no way to
 * reach.
 *
 * That is the shape this repo has an incident for: copy that instructs and a
 * surface that cannot obey. The string match is deliberately anchored on the
 * server's own sentence rather than on "401" or "token", so an unrelated
 * failure never offers a reconnect that would not have helped.
 */
const TOKEN_REJECTED = 'GitHub rejected your connected token';

export function isGithubTokenRejected(message) {
  return String(message || '').includes(TOKEN_REJECTED);
}

/** What to tell someone whose stored authorization GitHub no longer accepts. */
export function githubReconnectPrompt() {
  return {
    title: 'GitHub rejected your saved authorization',
    detail: 'It was revoked or it expired. Reconnecting takes a few seconds and keeps your work.',
    action: 'Reconnect GitHub',
    href: GITHUB_CONNECT_URL,
  };
}

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
  listRepositories: '/api/github/list-repos',
  listBranches: '/api/github/list-branches',
  checkout: '/api/github/checkout',
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
  [GITHUB_ENDPOINTS.listRepositories]: 'github-list-repos',
  [GITHUB_ENDPOINTS.listBranches]: 'github-list-branches',
  [GITHUB_ENDPOINTS.checkout]: 'github-checkout',
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

/* ------------------------------------------------------------------ *
 * Where the work is going to sit
 * ------------------------------------------------------------------ */

/**
 * The destination chosen before a build starts: which repository, which branch.
 *
 * `null` is a real, supported answer and the default one — most builds never
 * want a repository, and a picker that insists on one before you can type is a
 * worse product than no picker. "Not saved to GitHub" is a state the bar shows
 * plainly rather than an empty slot that looks broken.
 */
export function normalizeGithubDestination(value) {
  if (!value || typeof value !== 'object') return null;
  const owner = String(value.owner || '').trim();
  const repo = String(value.repo || '').trim();
  if (!owner || !repo) return null;
  const defaultBranch = String(value.defaultBranch || '').trim() || 'main';
  return {
    owner,
    repo,
    defaultBranch,
    branch: String(value.branch || '').trim() || defaultBranch,
    canPush: value.canPush !== false,
    isPrivate: value.isPrivate === true,
  };
}

export function githubDestinationRepoUrl(destination) {
  const target = normalizeGithubDestination(destination);
  return target ? `https://github.com/${target.owner}/${target.repo}` : '';
}

/** The three chips, in the order they are read: owner, repository, branch. */
export function githubDestinationChips(destination, connection) {
  const target = normalizeGithubDestination(destination);
  if (!connection || connection.connected !== true) {
    return [{ id: 'connect', label: 'Connect GitHub', tone: 'invite' }];
  }
  if (!target) {
    return [
      { id: 'owner', label: connection.login || 'GitHub', tone: 'muted' },
      { id: 'repo', label: 'No repository', tone: 'invite' },
    ];
  }
  return [
    { id: 'owner', label: target.owner, tone: 'muted' },
    { id: 'repo', label: target.repo, tone: target.canPush ? 'set' : 'warn' },
    { id: 'branch', label: target.branch, tone: 'set' },
  ];
}

/**
 * Why a chosen destination cannot receive this build, or '' when it can.
 *
 * Answered here, before the build, because the alternative is discovering it at
 * the push — after the work is done, which is the most expensive moment to find
 * out you were never allowed to write there.
 */
export function githubDestinationBlocker(destination) {
  const target = normalizeGithubDestination(destination);
  if (!target) return '';
  if (!target.canPush) {
    return `You have read access to ${target.owner}/${target.repo}, not write. Quantora could build here but never save it. Pick another repository.`;
  }
  return '';
}

/**
 * A checkout, as the desk's file map.
 *
 * The desk stores each file as `{ content, language }`, NOT as a bare string.
 * A first version of this wrote strings, which every part of the desk then read
 * as an entry with no content — so a checkout loaded and the pane reported "the
 * shell is empty while Preview has files", with no error anywhere. The shape is
 * the whole job of this function, which is why it is named and tested.
 *
 * The empty case matters too: replacing the desk with {} would silently wipe
 * whatever the user had, which is a data-loss bug wearing the clothes of a
 * no-op. Callers check the result before setting state.
 */
/*
 * Moved to vfs-language.js so desk-checkpoints.js can use it without pulling
 * this module -- and the whole GitHub integration -- into the eagerly loaded
 * desk bundle. Re-exported so every existing caller here is untouched.
 */
export { languageForPath } from './vfs-language.js';
import { languageForPath } from './vfs-language.js';

export function checkoutFilesToVfs(files = []) {
  const vfs = {};
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') continue;
    const path = file.path.replace(/^\/+/, '');
    if (!path) continue;
    vfs[path] = { content: file.content, language: languageForPath(path) };
  }
  return vfs;
}

/** What opening a repository in the desk should say afterwards. */
export function checkoutOutcomeMessage(checkout = {}) {
  const count = Array.isArray(checkout.files) ? checkout.files.length : 0;
  const where = `${checkout.owner}/${checkout.repo}`;
  const at = String(checkout.commitSha || '').slice(0, 7);
  const head = `Opened ${where} at ${checkout.branch}${at ? ` (${at})` : ''} — ${count} file${count === 1 ? '' : 's'}.`;
  // The notice is the server's own account of what it could not bring.
  return checkout.notice ? `${head} ${checkout.notice}` : head;
}
