/**
 * Honest terminal rules for the coding desk.
 * Do not invent command output. A shell runs only when files exist and
 * the page can actually boot WebContainer.
 */

import { desktopRuntimeBlocker } from './desk-runtime.js';

export function studioTerminalBlocker({ isolated = false, fileCount = 0, desktop = null } = {}) {
  // Desktop: a real process in an attached folder; isolation is irrelevant.
  if (desktop) {
    const blocked = desktopRuntimeBlocker(desktop);
    if (blocked) return blocked;
  } else if (!isolated) {
    return 'Terminal cannot start on this page. A real shell needs an isolated session. Preview still works.';
  }
  if (!fileCount) {
    return 'No files in this desk yet. Build something first, then the shell runs against those files.';
  }
  return '';
}

export function studioFileCount(vfs = {}) {
  return Object.keys(vfs).filter((path) => path && vfs[path] && typeof vfs[path].content === 'string').length;
}
