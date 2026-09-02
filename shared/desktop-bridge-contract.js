/*
 * Renderer ↔ desktop host bridge contract.
 *
 * The preload script (desktop/preload/index.ts) exposes exactly this surface
 * on window[DESKTOP_BRIDGE_KEY]; the web app (src/lib/desktop-bridge.js)
 * consumes it; the main process (desktop/main/ipc.ts) answers on exactly
 * these channels. All three import this file, so a renamed channel fails
 * tests in every party at once instead of failing silently in one.
 *
 * No DOM, no Node, no Electron.
 */

export const DESKTOP_BRIDGE_KEY = 'quantoraDesktop';

/** Bump when the bridge surface changes shape. The renderer refuses a mismatch. */
export const DESKTOP_BRIDGE_VERSION = 1;

export const DESKTOP_IPC = Object.freeze({
  hostInfo: 'quantora:host:info',
  authStatus: 'quantora:auth:status',
  authSignIn: 'quantora:auth:sign-in',
  authSignOut: 'quantora:auth:sign-out',
  authChanged: 'quantora:auth:changed',
  openExternal: 'quantora:shell:open-external',
});

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

/** True when `candidate` looks like a bridge this renderer knows how to talk to. */
export function isDesktopBridge(candidate) {
  return Boolean(
    candidate
    && candidate.version === DESKTOP_BRIDGE_VERSION
    && typeof candidate.host === 'function'
    && candidate.auth
    && typeof candidate.auth.status === 'function'
    && typeof candidate.auth.signIn === 'function'
    && typeof candidate.auth.signOut === 'function'
    && typeof candidate.auth.onChanged === 'function'
    && typeof candidate.openExternal === 'function',
  );
}
