/*
 * Desk runtime contract — what a Coding Desk may ask a runtime to do.
 *
 * Two runtimes implement it: WebContainer in the browser (src/lib/webcontainer.js)
 * and real processes on a real folder in the desktop (desktop/runtime/*). The
 * limits and validators here are enforced in the desktop MAIN process before
 * anything touches the filesystem or a shell, and mirrored in the renderer so
 * the UI can refuse early. Pure: no DOM, no Node, no Electron.
 */

export const DESK_GIT_ACTIONS = Object.freeze(['init', 'status', 'diff', 'commit']);

/** A desk never syncs more than this many files or bytes per file to disk. */
export const DESK_SYNC_MAX_FILES = 2000;
export const DESK_SYNC_MAX_FILE_BYTES = 4 * 1024 * 1024;

/** One shell line, as typed on the desk. */
export const DESK_COMMAND_MAX_LENGTH = 4096;

/** Collected output is capped so a runaway process cannot flood the renderer. */
export const DESK_OUTPUT_MAX_BYTES = 256 * 1024;

/** A command that has produced nothing for this long is killed. */
export const DESK_COMMAND_TIMEOUT_MS = 60_000;

const SEGMENT = /^[^/\\\0]+$/;

/**
 * A workspace-relative path the desk may write: forward slashes, no empty or
 * dot-dot segments, no leading slash, no drive letter, no NUL, no absolute
 * form. `normalizeStudioWorkspacePath` already strips most of this in the
 * renderer; the main process trusts nothing and checks again.
 */
export function isValidWorkspaceRelativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 1024) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '.' && segment !== '..' && SEGMENT.test(segment));
}

export function isValidDeskCommand(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= DESK_COMMAND_MAX_LENGTH
    && !value.includes('\0');
}

export function isDeskGitAction(value) {
  return DESK_GIT_ACTIONS.includes(value);
}

/**
 * Validate a sync payload from the renderer. Returns the accepted entries or
 * the first reason to refuse the whole batch — a partial write would leave
 * the folder in a state the desk never showed.
 */
export function validateDeskSyncEntries(entries) {
  if (!Array.isArray(entries)) return { ok: false, reason: 'entries must be an array' };
  if (entries.length > DESK_SYNC_MAX_FILES) return { ok: false, reason: `more than ${DESK_SYNC_MAX_FILES} files` };
  const seen = new Set();
  const accepted = [];
  for (const entry of entries) {
    const path = entry?.path;
    const content = entry?.content;
    if (!isValidWorkspaceRelativePath(path)) return { ok: false, reason: `invalid path: ${String(path).slice(0, 80)}` };
    if (typeof content !== 'string') return { ok: false, reason: `content of ${path} is not text` };
    if (content.length > DESK_SYNC_MAX_FILE_BYTES) return { ok: false, reason: `${path} exceeds ${DESK_SYNC_MAX_FILE_BYTES} bytes` };
    if (seen.has(path)) return { ok: false, reason: `duplicate path: ${path}` };
    seen.add(path);
    accepted.push({ path, content });
  }
  return { ok: true, entries: accepted };
}
