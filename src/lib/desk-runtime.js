/*
 * Which runtime a Coding Desk's shell and git run on.
 *
 *   website  → WebContainer (src/lib/webcontainer.js), needs an isolated page
 *   desktop  → real processes in a folder the user attached (desktop/runtime)
 *
 * The desk panes never branch on this themselves: webcontainer.js consults
 * it inside the two seams the panes already call (runCommandInWorkspace,
 * runGitInWorkspace), and the blockers take the desktop state so the copy
 * says "attach a folder" instead of "needs an isolated session".
 */
import { getDesktopBridge } from './desktop-bridge.js';
import { deskShellVfs, studioWorkspaceFileEntries } from './studio-workspace-tree.js';

export function getDeskRuntime(scope) {
  const bridge = getDesktopBridge(scope);
  return bridge ? { kind: 'desktop', bridge } : { kind: 'webcontainer', bridge: null };
}

/** Push the desk's files to the attached folder, then run `line` there. */
export async function runDesktopCommand(bridge, vfs, line) {
  const synced = await bridge.runtime.sync(studioWorkspaceFileEntries(deskShellVfs(vfs)));
  if (!synced?.ok) return { ok: false, output: synced?.error || 'The desk files could not be written to the attached folder.' };
  const result = await bridge.runtime.run(line);
  return { ok: result?.ok === true, output: result?.output || `(exit ${result?.exitCode ?? 'unknown'})` };
}

export async function runDesktopGit(bridge, vfs, { action, message } = {}) {
  const synced = await bridge.runtime.sync(studioWorkspaceFileEntries(deskShellVfs(vfs)));
  if (!synced?.ok) return { ok: false, output: synced?.error || 'The desk files could not be written to the attached folder.' };
  const result = await bridge.runtime.git({ action, message });
  return { ok: result?.ok === true, output: result?.output || '' };
}

/**
 * Copy for a desk whose runtime is the desktop but has no folder yet.
 * Returns '' when the desktop runtime is ready (or when this is the website).
 */
export function desktopRuntimeBlocker(desktop) {
  if (!desktop) return '';
  if (!desktop.attached) return 'Attach a folder to this desk to run a real shell and git there.';
  return '';
}
