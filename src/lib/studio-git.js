/**
 * Git on the coding desk is for this generated app only.
 * Status, diff, commit, and init. Never Quantora's GitHub, never push.
 */

import { studioFileCount } from './studio-terminal.js';

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

/**
 * Fixed argv lists only. User text is never interpolated into a shell string.
 */
export function studioGitArgv(action, message) {
  const kind = normalizeStudioGitAction(action);
  if (kind === 'init') {
    return [
      ['git', 'init'],
      ['git', 'config', 'user.email', 'desk@quantora.local'],
      ['git', 'config', 'user.name', 'Quantora coding desk'],
    ];
  }
  if (kind === 'status') {
    return [['git', 'status', '--short', '--branch']];
  }
  if (kind === 'diff') {
    return [
      ['git', '--no-pager', 'diff'],
      ['git', '--no-pager', 'diff', '--cached'],
    ];
  }
  const commitMessage = normalizeStudioGitCommitMessage(message);
  return [
    ['git', 'add', '-A'],
    ['git', 'commit', '-m', commitMessage],
  ];
}

export function looksLikeMissingGitRepo(output) {
  return /not a git repository/i.test(String(output || ''));
}
