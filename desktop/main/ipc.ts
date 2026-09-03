import { ipcMain, shell } from "electron";
import { DESKTOP_IPC, isAllowedExternalUrl, isCloneableRepositoryUrl } from "../../shared/desktop-bridge-contract.js";
import { isDeskGitAction, isValidDeskCommand } from "../../shared/desk-runtime-contract.js";
import { apiOrigin, desktopVersion, isSmokeMode } from "./config.js";
import { beginSignIn, sessionStatus, signOut } from "./auth-broker.js";
import { getMainWindow } from "./window.js";
import { syncWorkspaceFiles, workspaceInfo, workspaceRoot } from "../runtime/workspace.js";
import { listWorkspaceTree, readWorkspaceFile, snapshotWorkspace, writeWorkspaceFile } from "../runtime/files.js";
import { runCollected } from "../runtime/shell.js";
import { cloneRepository, runDeskGitOnDisk } from "../runtime/git.js";
import { closeAllPtys, closePty, openPty, ptyAvailable, resizePty, writePty } from "../runtime/pty.js";
import { startWatching, stopWatching } from "../runtime/watch.js";
import { closeWorkspace, openWorkspacePath, pickAndOpenWorkspace, pickCloneDestination, readRecentWorkspaces } from "./workspaces.js";
import { notificationsSupported, stopWatchLoop, watchLoopRunning } from "./watch-loop.js";
import { trayActive } from "./tray.js";

/*
 * The enumerated bridge surface (design §9). Every channel name comes from
 * the shared contract; every argument is validated here, in the main
 * process, before it touches anything. There is no generic passthrough.
 */

function send(channel: string, payload: unknown): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function capabilities() {
  const { attached } = workspaceInfo();
  return {
    folder: true,
    shell: attached,
    terminal: attached && ptyAvailable(),
    git: attached,
    notifications: notificationsSupported(),
    background: trayActive(),
    watchLoop: watchLoopRunning(),
  };
}

function afterWorkspaceChange(): void {
  closeAllPtys();
  stopWatching();
  const info = workspaceInfo();
  if (info.attached && info.root) {
    startWatching(info.root, (paths) => send(DESKTOP_IPC.workspaceChanged, { paths }));
  }
}

function withWorkspace<T>(fn: (root: string) => T, fallback: T): T {
  const { attached } = workspaceInfo();
  if (!attached) return fallback;
  return fn(workspaceRoot());
}

export function registerIpc(): void {
  ipcMain.handle(DESKTOP_IPC.hostInfo, () => ({
    version: desktopVersion(),
    platform: process.platform,
    apiOrigin: apiOrigin(),
    capabilities: capabilities(),
  }));

  ipcMain.handle(DESKTOP_IPC.openExternal, async (_event, url: unknown) => {
    if (typeof url !== "string" || !isAllowedExternalUrl(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  // ---- identity ----------------------------------------------------------

  ipcMain.handle(DESKTOP_IPC.authStatus, () => sessionStatus());
  ipcMain.handle(DESKTOP_IPC.authSignIn, () => beginSignIn());
  ipcMain.handle(DESKTOP_IPC.authSignOut, async () => {
    await signOut();
    stopWatchLoop();
    closeWorkspace();
    afterWorkspaceChange();
    notifyAuthChanged({ signedIn: false });
    return { ok: true };
  });

  // ---- workspace lifecycle -----------------------------------------------

  ipcMain.handle(DESKTOP_IPC.workspaceInfo, () => ({ ...workspaceInfo(), capabilities: capabilities() }));

  ipcMain.handle(DESKTOP_IPC.workspaceOpen, async () => {
    // Consent is a native dialog, never a page-supplied path. The smoke gate
    // pre-approves one folder through the environment instead.
    const preapproved = isSmokeMode() ? process.env.QUANTORA_SMOKE_WORKSPACE : undefined;
    const outcome = await pickAndOpenWorkspace(preapproved);
    afterWorkspaceChange();
    return { ...outcome, capabilities: capabilities() };
  });

  ipcMain.handle(DESKTOP_IPC.workspaceOpenPath, (_event, folder: unknown) => {
    // Only paths the host itself handed out (the recent list) are accepted.
    const known = readRecentWorkspaces().some((item) => item.path === folder);
    if (typeof folder !== "string" || !known) return { ...workspaceInfo(), error: "That folder is not in your recent workspaces." };
    const outcome = openWorkspacePath(folder);
    afterWorkspaceChange();
    return { ...outcome, capabilities: capabilities() };
  });

  ipcMain.handle(DESKTOP_IPC.workspaceClose, () => {
    const info = closeWorkspace();
    afterWorkspaceChange();
    return { ...info, capabilities: capabilities() };
  });

  ipcMain.handle(DESKTOP_IPC.workspaceRecent, () => readRecentWorkspaces());

  ipcMain.handle(DESKTOP_IPC.workspaceClone, async (_event, url: unknown) => {
    if (!isCloneableRepositoryUrl(url)) return { ok: false, output: "That is not a repository URL this desk will clone." };
    const destination = await pickCloneDestination(String(url));
    if (!destination) return { ok: false, output: "", cancelled: true };
    const result = await cloneRepository(url, destination);
    if (!result.ok) return result;
    const outcome = openWorkspacePath(destination);
    afterWorkspaceChange();
    return { ...result, workspace: { ...outcome, capabilities: capabilities() } };
  });

  // ---- files ---------------------------------------------------------------

  ipcMain.handle(DESKTOP_IPC.filesTree, () => withWorkspace((root) => listWorkspaceTree(root), { entries: [], truncated: false }));
  ipcMain.handle(DESKTOP_IPC.filesRead, (_event, relativePath: unknown) => withWorkspace((root) => readWorkspaceFile(root, relativePath), { ok: false as const, error: "No workspace is open." }));
  ipcMain.handle(DESKTOP_IPC.filesWrite, (_event, relativePath: unknown, content: unknown) => withWorkspace((root) => writeWorkspaceFile(root, relativePath, content), { ok: false as const, error: "No workspace is open." }));
  ipcMain.handle(DESKTOP_IPC.filesSnapshot, () => withWorkspace((root) => snapshotWorkspace(root), { vfs: {}, files: 0, bytes: 0, truncated: false }));
  ipcMain.handle(DESKTOP_IPC.filesSync, (_event, entries: unknown) => syncWorkspaceFiles(entries));

  // ---- processes -----------------------------------------------------------

  ipcMain.handle(DESKTOP_IPC.runCollected, async (_event, line: unknown) => {
    if (!isValidDeskCommand(line)) return { ok: false, output: "That is not a command this desk can run.", exitCode: null };
    const { attached } = workspaceInfo();
    if (!attached) return { ok: false, output: "No workspace is open.", exitCode: null };
    return runCollected(line as string, { cwd: workspaceRoot() });
  });

  ipcMain.handle(DESKTOP_IPC.ptyOpen, (_event, size: unknown) => {
    const { attached } = workspaceInfo();
    if (!attached) return { ok: false, error: "No workspace is open." };
    const cols = Number((size as any)?.cols) || 80;
    const rows = Number((size as any)?.rows) || 24;
    return openPty(workspaceRoot(), { cols, rows }, {
      onData: (id, chunk) => send(DESKTOP_IPC.ptyData, { id, chunk }),
      onExit: (id, exitCode) => send(DESKTOP_IPC.ptyExit, { id, exitCode }),
    });
  });
  ipcMain.handle(DESKTOP_IPC.ptyWrite, (_event, id: unknown, data: unknown) => {
    if (typeof id !== "string" || typeof data !== "string" || data.length > 65536) return false;
    return writePty(id, data);
  });
  ipcMain.handle(DESKTOP_IPC.ptyResize, (_event, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id !== "string") return false;
    return resizePty(id, Number(cols) || 80, Number(rows) || 24);
  });
  ipcMain.handle(DESKTOP_IPC.ptyClose, (_event, id: unknown) => {
    if (typeof id === "string") closePty(id);
    return true;
  });

  ipcMain.handle(DESKTOP_IPC.gitRun, async (_event, request: unknown) => {
    const action = (request as any)?.action;
    const message = (request as any)?.message;
    if (!isDeskGitAction(action)) return { ok: false, output: "This desk only runs git status, diff, commit, and start git for this app." };
    if (message !== undefined && typeof message !== "string") return { ok: false, output: "Commit message must be text." };
    const { attached } = workspaceInfo();
    if (!attached) return { ok: false, output: "No workspace is open." };
    return runDeskGitOnDisk(action, message, workspaceRoot());
  });
}

export function notifyAuthChanged(payload: { signedIn: boolean }): void {
  send(DESKTOP_IPC.authChanged, payload);
}

export function shutdownRuntime(): void {
  closeAllPtys();
  stopWatching();
}
