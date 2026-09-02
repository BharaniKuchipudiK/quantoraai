import { contextBridge, ipcRenderer } from "electron";
import { DESKTOP_BRIDGE_KEY, DESKTOP_BRIDGE_VERSION, DESKTOP_IPC } from "../../shared/desktop-bridge-contract.js";

/*
 * The only door between the page and the host. Runs sandboxed: this file is
 * bundled to a single CJS module and can require nothing but `electron`.
 * Fixed functions on fixed channels; no ipcRenderer passthrough.
 */

const bridge = {
  version: DESKTOP_BRIDGE_VERSION,
  host: () => ipcRenderer.invoke(DESKTOP_IPC.hostInfo),
  auth: {
    status: () => ipcRenderer.invoke(DESKTOP_IPC.authStatus),
    signIn: () => ipcRenderer.invoke(DESKTOP_IPC.authSignIn),
    signOut: () => ipcRenderer.invoke(DESKTOP_IPC.authSignOut),
    onChanged: (callback: (payload: { signedIn: boolean }) => void) => {
      const listener = (_event: unknown, payload: { signedIn: boolean }) => callback(payload);
      ipcRenderer.on(DESKTOP_IPC.authChanged, listener);
      return () => ipcRenderer.removeListener(DESKTOP_IPC.authChanged, listener);
    },
  },
  openExternal: (url: string) => ipcRenderer.invoke(DESKTOP_IPC.openExternal, url),
  runtime: {
    info: () => ipcRenderer.invoke(DESKTOP_IPC.runtimeInfo),
    attach: () => ipcRenderer.invoke(DESKTOP_IPC.runtimeAttach),
    detach: () => ipcRenderer.invoke(DESKTOP_IPC.runtimeDetach),
    sync: (entries: Array<{ path: string; content: string }>) => ipcRenderer.invoke(DESKTOP_IPC.runtimeSync, entries),
    run: (line: string) => ipcRenderer.invoke(DESKTOP_IPC.runtimeRun, line),
    git: (request: { action: string; message?: string }) => ipcRenderer.invoke(DESKTOP_IPC.runtimeGit, request),
  },
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
