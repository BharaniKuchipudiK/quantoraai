import { dialog, ipcMain, shell } from "electron";
import { DESKTOP_IPC, isAllowedExternalUrl } from "../../shared/desktop-bridge-contract.js";
import { isDeskGitAction, isValidDeskCommand } from "../../shared/desk-runtime-contract.js";
import { apiOrigin, desktopVersion, isSmokeMode } from "./config.js";
import { beginSignIn, sessionStatus, signOut } from "./auth-broker.js";
import { getMainWindow } from "./window.js";
import { attachWorkspace, detachWorkspace, syncWorkspaceFiles, workspaceInfo, workspaceRoot } from "../runtime/workspace.js";
import { runCollected } from "../runtime/shell.js";
import { runDeskGitOnDisk } from "../runtime/git.js";

/*
 * The enumerated bridge surface (design §9). Every channel name comes from
 * the shared contract; every argument is validated here, in the main
 * process, before it touches anything. There is no generic passthrough.
 */

function capabilities() {
  const { attached } = workspaceInfo();
  return {
    folder: true,
    shell: attached,
    git: attached,
    devServer: false,     // D2b
    notifications: false, // D3
  };
}

export function registerIpc(): void {
  ipcMain.handle(DESKTOP_IPC.hostInfo, () => ({
    version: desktopVersion(),
    platform: process.platform,
    apiOrigin: apiOrigin(),
    capabilities: capabilities(),
  }));

  ipcMain.handle(DESKTOP_IPC.authStatus, () => sessionStatus());
  ipcMain.handle(DESKTOP_IPC.authSignIn, () => beginSignIn());
  ipcMain.handle(DESKTOP_IPC.authSignOut, async () => {
    await signOut();
    notifyAuthChanged({ signedIn: false });
    return { ok: true };
  });

  ipcMain.handle(DESKTOP_IPC.openExternal, async (_event, url: unknown) => {
    if (typeof url !== "string" || !isAllowedExternalUrl(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  // ---- local runtime (design §6.2) -------------------------------------

  ipcMain.handle(DESKTOP_IPC.runtimeInfo, () => ({ ...workspaceInfo(), capabilities: capabilities() }));

  ipcMain.handle(DESKTOP_IPC.runtimeAttach, async () => {
    // Consent is a native dialog, never a page-supplied path. The smoke gate
    // pre-approves one folder through the environment instead.
    const smokeFolder = isSmokeMode() ? process.env.QUANTORA_SMOKE_WORKSPACE : undefined;
    let folder: string | undefined = smokeFolder;
    if (!folder) {
      const win = getMainWindow();
      const picked = await dialog.showOpenDialog(win ?? undefined as any, {
        title: "Attach a folder to this desk",
        message: "The desk's files are written here, and the shell and git run here.",
        properties: ["openDirectory", "createDirectory"],
      });
      if (picked.canceled || !picked.filePaths[0]) return { ...workspaceInfo(), cancelled: true };
      folder = picked.filePaths[0];
    }
    try {
      return { ...attachWorkspace(folder), cancelled: false };
    } catch (error: any) {
      return { ...workspaceInfo(), cancelled: false, error: error?.message || "Could not attach that folder." };
    }
  });

  ipcMain.handle(DESKTOP_IPC.runtimeDetach, () => detachWorkspace());

  ipcMain.handle(DESKTOP_IPC.runtimeSync, (_event, entries: unknown) => syncWorkspaceFiles(entries));

  ipcMain.handle(DESKTOP_IPC.runtimeRun, async (_event, line: unknown) => {
    if (!isValidDeskCommand(line)) return { ok: false, output: "That is not a command this desk can run.", exitCode: null };
    const { attached } = workspaceInfo();
    if (!attached) return { ok: false, output: "No folder is attached to this desk.", exitCode: null };
    return runCollected(line as string, { cwd: workspaceRoot() });
  });

  ipcMain.handle(DESKTOP_IPC.runtimeGit, async (_event, request: unknown) => {
    const action = (request as any)?.action;
    const message = (request as any)?.message;
    if (!isDeskGitAction(action)) return { ok: false, output: "This desk only runs git status, diff, commit, and start git for this app." };
    if (message !== undefined && typeof message !== "string") return { ok: false, output: "Commit message must be text." };
    const { attached } = workspaceInfo();
    if (!attached) return { ok: false, output: "No folder is attached to this desk." };
    return runDeskGitOnDisk(action, message, workspaceRoot());
  });
}

export function notifyAuthChanged(payload: { signedIn: boolean }): void {
  const win = getMainWindow();
  if (win) win.webContents.send(DESKTOP_IPC.authChanged, payload);
}
