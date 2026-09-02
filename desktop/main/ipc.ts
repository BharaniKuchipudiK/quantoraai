import { ipcMain, shell } from "electron";
import { DESKTOP_IPC, isAllowedExternalUrl } from "../../shared/desktop-bridge-contract.js";
import { apiOrigin, desktopVersion } from "./config.js";
import { beginSignIn, sessionStatus, signOut } from "./auth-broker.js";
import { getMainWindow } from "./window.js";

/*
 * The enumerated bridge surface (design §9). Every channel name comes from
 * the shared contract; every argument is validated here, in the main
 * process, before it touches anything. There is no generic passthrough.
 */

export function registerIpc(): void {
  ipcMain.handle(DESKTOP_IPC.hostInfo, () => ({
    version: desktopVersion(),
    platform: process.platform,
    apiOrigin: apiOrigin(),
    capabilities: {
      shell: false,      // D2
      git: false,        // D2
      devServer: false,  // D2
      folder: false,     // D2
      notifications: false, // D3
    },
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
}

export function notifyAuthChanged(payload: { signedIn: boolean }): void {
  const win = getMainWindow();
  if (win) win.webContents.send(DESKTOP_IPC.authChanged, payload);
}
