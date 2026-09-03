/**
 * Git on the coding desk is for this generated app only.
 * Status, diff, commit, and init. Never Quantora's GitHub, never push.
 * Preview is often a blob, so status/commit run on that tree — not a hung WebContainer.
 */

import { unifiedTreeDiff } from './studio-file-review.js';
import { studioFileCount } from './studio-terminal.js';
import {
  deskListing,
  deskShellVfs,
  listingShowsGeneratedProjectFile,
  studioWorkspaceFileEntries,
} from './studio-workspace-tree.js';

export const STUDIO_GIT_ACTIONS = Object.freeze(['init', 'status', 'diff', 'commit']);

export function studioGitBlocker({ isolated = false, fileCount = 0 } = {}) {
  if (!isolated) {
    return 'Git cannot start on this page. A real git needs an isolated session. Preview still works.';
  }
  if (!fileCount) {
    return 'No files in this desk yet. Build something first, then git runs against those files.';
  }
  return '';
}

export function studioGitFileCount(vfs = {}) {
  return studioFileCount(vfs);
}

export function normalizeStudioGitAction(action) {
  const value = String(action || '').trim().toLowerCase();
  if (STUDIO_GIT_ACTIONS.includes(value)) return value;
  throw new Error('This desk only runs git status, diff, commit, and start git for this app. Not Quantora’s GitHub.');
}

export function normalizeStudioGitCommitMessage(message) {
  const value = String(message || '').trim();
  if (!value) {
    throw new Error('Commit needs a real message. Git did not run.');
  }
  if (/\n/.test(value)) {
    throw new Error('Commit message must be a single line.');
  }
  return value;
}

/** The panel must show a diff as a diff, so added and removed lines are told apart. */
export function classifyDeskGitLine(line = '') {
  const text = String(line || '');
  if (text.startsWith('$ ')) return 'command';
  if (text.startsWith('@@')) return 'hunk';
  if (text.startsWith('diff --git ') || text.startsWith('--- ') || text.startsWith('+++ ')) return 'file';
  if (text.startsWith('+')) return 'add';
  if (text.startsWith('-')) return 'del';
  return 'plain';
}

export function looksLikeMissingGitRepo(output) {
  return /not a git repository/i.test(String(output || ''));
}

/** Last committed snapshot per coding-desk session. Changing chats drops that repo. */
const deskRepos = new Map();

export function resetDeskGitRepos() {
  deskRepos.clear();
}

function snapshotDeskFiles(vfs = {}) {
  return Object.fromEntries(studioWorkspaceFileEntries(vfs).map((file) => [file.path, file.content]));
}

function ensureDeskRepo(workspaceKey = '') {
  const key = String(workspaceKey || 'default');
  if (!deskRepos.has(key)) {
    deskRepos.set(key, { committed: null, commits: [], base: null });
  }
  return { key, repo: deskRepos.get(key) };
}

/**
 * Seed the desk from a real checkout, so git here means something.
 *
 * Without this, opening a repository and immediately running status reported
 * every file in the project as untracked — technically true of an empty
 * in-memory repo, and useless as an answer, because the honest answer is
 * "nothing has changed yet". A baseline the desk did not receive from anywhere
 * cannot tell the user what they changed; one taken from the commit they opened
 * can.
 *
 * `base` is what separates a working copy from a pile of files: it names the
 * commit these contents came from, so a later diff is against the repository
 * rather than against whatever happened to be committed locally last.
 */
export function seedDeskRepoFromCheckout(workspaceKey, files = [], base = null) {
  const { repo } = ensureDeskRepo(workspaceKey);
  const committed = {};
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') continue;
    const path = file.path.replace(/^\/+/, '');
    if (path) committed[path] = file.content;
  }
  // An empty checkout must not become an empty baseline: that would report the
  // user's whole project as newly added the moment they touched anything.
  if (Object.keys(committed).length === 0) return false;

  repo.committed = committed;
  repo.commits = [];
  repo.base = base && base.commitSha
    ? {
        commitSha: String(base.commitSha),
        branch: String(base.branch || 'main'),
        repository: String(base.repository || ''),
      }
    : null;
  return true;
}

/** What this desk is a working copy of, or null when it is a generated build. */
export function deskGitBase(workspaceKey) {
  return deskRepos.get(String(workspaceKey || 'default'))?.base || null;
}

/**
 * The status header. A generated build has no origin, so it says so; a checkout
 * names the branch and commit, because "modified" is only meaningful once the
 * reader knows what it is modified from.
 */
export function deskGitStatusHeader(base) {
  if (!base?.commitSha) return '## desk';
  const where = base.repository ? `${base.repository} ` : '';
  return `## ${where}${base.branch}...${String(base.commitSha).slice(0, 7)}`;
}

function formatStatusLines(current, committed, base = null) {
  const paths = Object.keys(current).sort((a, b) => a.localeCompare(b));
  if (!committed) {
    return ['## No commits yet — this app', ...paths.map((path) => `?? ${path}`)];
  }
  const lines = [deskGitStatusHeader(base)];
  const seen = new Set(paths);
  for (const path of paths) {
    if (!(path in committed)) lines.push(`?? ${path}`);
    else if (committed[path] !== current[path]) lines.push(` M ${path}`);
  }
  for (const path of Object.keys(committed).sort((a, b) => a.localeCompare(b))) {
    if (!seen.has(path)) lines.push(` D ${path}`);
  }
  if (lines.length === 1) lines.push('working tree clean');
  return lines;
}

/**
 * A filename is not a diff. Before there is a commit to diff against, say so
 * and list the untracked tree instead of printing a file list under "diff".
 */
function formatDiffLines(current, committed) {
  if (!committed) {
    return [
      '## No commits yet — this app',
      ...Object.keys(current).sort((a, b) => a.localeCompare(b)).map((path) => `?? ${path}`),
      'Commit once, then Diff shows the exact lines that changed.',
    ];
  }
  return unifiedTreeDiff(committed, current);
}

/**
 * Status, diff, commit, and init against the Preview tree.
 * Same files Preview is running. No WebContainer wait.
 */
export function runDeskGit(vfs = {}, { action, message, workspaceKey } = {}) {
  const tree = deskShellVfs(vfs);
  const files = studioWorkspaceFileEntries(tree);
  const listing = deskListing(tree);
  if (!files.length) {
    return {
      ok: false,
      output: 'The shell is empty while Preview has files. No fake status was shown.',
    };
  }

  let kind;
  try {
    kind = normalizeStudioGitAction(action);
  } catch (error) {
    return { ok: false, output: error?.message || 'Git did not run.' };
  }

  const { repo } = ensureDeskRepo(workspaceKey);
  const current = snapshotDeskFiles(tree);

  if (kind === 'init') {
    if (!repo.commits.length) repo.committed = null;
    const output = ['Git is ready in this app.', listing].filter(Boolean).join('\n');
    return { ok: true, output };
  }

  if (kind === 'status') {
    return { ok: true, output: formatStatusLines(current, repo.committed, repo.base).join('\n') };
  }

  if (kind === 'diff') {
    const lines = formatDiffLines(current, repo.committed);
    return { ok: true, output: lines.length ? lines.join('\n') : '## desk\nworking tree clean' };
  }

  let commitMessage;
  try {
    commitMessage = normalizeStudioGitCommitMessage(message);
  } catch (error) {
    return { ok: false, output: [error?.message || 'Commit needs a real message.', listing].filter(Boolean).join('\n') };
  }

  repo.committed = current;
  repo.commits.push({ message: commitMessage, files: Object.keys(current) });
  const output = [`[desk] ${commitMessage}`, listing].filter(Boolean).join('\n');
  if (files.length && !listingShowsGeneratedProjectFile(output)) {
    return { ok: true, output: [output, listing].filter(Boolean).join('\n') };
  }
  return { ok: true, output };
}
