/*
 * Renderer ↔ desktop host bridge contract.
 *
 * The preload script (desktop/preload/index.ts) exposes exactly this surface
 * on window[DESKTOP_BRIDGE_KEY]; the desktop renderer (desktop/renderer)
 * consumes it; the main process (desktop/main/ipc.ts) answers on exactly
 * these channels. All three import this file, so a renamed channel fails
 * tests in every party at once instead of failing silently in one.
 *
 * No DOM, no Node, no Electron.
 */

export const DESKTOP_BRIDGE_KEY = 'quantoraDesktop';

/** Bump when the bridge surface changes shape. The renderer refuses a mismatch. */
export const DESKTOP_BRIDGE_VERSION = 3;

export const DESKTOP_IPC = Object.freeze({
  // host
  hostInfo: 'quantora:host:info',
  openExternal: 'quantora:shell:open-external',
  menuAction: 'quantora:menu:action',          // main → renderer
  // identity
  authStatus: 'quantora:auth:status',
  authSignIn: 'quantora:auth:sign-in',
  authSignOut: 'quantora:auth:sign-out',
  authChanged: 'quantora:auth:changed',        // main → renderer
  // workspace lifecycle
  workspaceInfo: 'quantora:workspace:info',
  workspaceOpen: 'quantora:workspace:open',    // native folder picker
  workspaceOpenPath: 'quantora:workspace:open-path',
  workspaceClose: 'quantora:workspace:close',
  workspaceRecent: 'quantora:workspace:recent',
  workspaceClone: 'quantora:workspace:clone',
  workspaceChanged: 'quantora:workspace:changed', // main → renderer (files changed on disk)
  // files inside the workspace
  filesTree: 'quantora:files:tree',
  filesRead: 'quantora:files:read',
  filesWrite: 'quantora:files:write',
  filesSnapshot: 'quantora:files:snapshot',    // text files as a desk VFS
  filesSync: 'quantora:files:sync',            // desk VFS → disk
  // processes
  runCollected: 'quantora:run:collected',
  ptyOpen: 'quantora:pty:open',
  ptyWrite: 'quantora:pty:write',
  ptyResize: 'quantora:pty:resize',
  ptyClose: 'quantora:pty:close',
  ptyData: 'quantora:pty:data',                // main → renderer
  ptyExit: 'quantora:pty:exit',                // main → renderer
  gitRun: 'quantora:git:run',
});

/** What a native menu item asks the renderer to do. */
export const DESKTOP_MENU_ACTIONS = Object.freeze([
  'open-folder',
  'close-workspace',
  'sign-out',
  'toggle-terminal',
  'toggle-chat',
  'save-file',
  'new-chat',
]);

/**
 * Links the desktop may hand to the system browser. https only: a custom
 * scheme or file: URL from page content must never reach shell.openExternal.
 */
export function isAllowedExternalUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/** Repositories the desktop will clone: https or ssh to a host, never a local path. */
export function isCloneableRepositoryUrl(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 512 || /\s/.test(text)) return false;
  if (/^https:\/\/[^/]+\/[^/]+\/[^/]+/.test(text)) return true;
  return /^git@[^:]+:[^/]+\/[^/]+/.test(text);
}

const isFn = (value) => typeof value === 'function';
const hasFns = (object, names) => Boolean(object) && names.every((name) => isFn(object[name]));

/** True when `candidate` looks like a bridge this renderer knows how to talk to. */
export function isDesktopBridge(candidate) {
  return Boolean(
    candidate
    && candidate.version === DESKTOP_BRIDGE_VERSION
    && isFn(candidate.host)
    && isFn(candidate.openExternal)
    && isFn(candidate.onMenuAction)
    && hasFns(candidate.auth, ['status', 'signIn', 'signOut', 'onChanged'])
    && hasFns(candidate.workspace, ['info', 'open', 'openPath', 'close', 'recent', 'clone', 'onChanged'])
    && hasFns(candidate.files, ['tree', 'read', 'write', 'snapshot', 'sync'])
    && hasFns(candidate.pty, ['open', 'write', 'resize', 'close', 'onData', 'onExit'])
    && hasFns(candidate.git, ['run'])
    && isFn(candidate.runCollected),
  );
}
