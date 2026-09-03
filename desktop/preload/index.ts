import { contextBridge, ipcRenderer } from "electron";
import { DESKTOP_BRIDGE_KEY, DESKTOP_BRIDGE_VERSION, DESKTOP_IPC } from "../../shared/desktop-bridge-contract.js";

/*
 * The only door between the page and the host. Runs sandboxed: this file is
 * bundled to a single CJS module and can require nothing but `electron`.
 * Fixed functions on fixed channels; no ipcRenderer passthrough.
 */

function subscribe<T>(channel: string) {
  return (callback: (payload: T) => void) => {
    const listener = (_event: unknown, payload: T) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

const bridge = {
  version: DESKTOP_BRIDGE_VERSION,
  host: () => ipcRenderer.invoke(DESKTOP_IPC.hostInfo),
  openExternal: (url: string) => ipcRenderer.invoke(DESKTOP_IPC.openExternal, url),
  onMenuAction: subscribe<string>(DESKTOP_IPC.menuAction),
  auth: {
    status: () => ipcRenderer.invoke(DESKTOP_IPC.authStatus),
    signIn: () => ipcRenderer.invoke(DESKTOP_IPC.authSignIn),
    signOut: () => ipcRenderer.invoke(DESKTOP_IPC.authSignOut),
    onChanged: subscribe<{ signedIn: boolean }>(DESKTOP_IPC.authChanged),
  },
  workspace: {
    info: () => ipcRenderer.invoke(DESKTOP_IPC.workspaceInfo),
    open: () => ipcRenderer.invoke(DESKTOP_IPC.workspaceOpen),
    openPath: (folder: string) => ipcRenderer.invoke(DESKTOP_IPC.workspaceOpenPath, folder),
    close: () => ipcRenderer.invoke(DESKTOP_IPC.workspaceClose),
    recent: () => ipcRenderer.invoke(DESKTOP_IPC.workspaceRecent),
    clone: (url: string) => ipcRenderer.invoke(DESKTOP_IPC.workspaceClone, url),
    onChanged: subscribe<{ paths: string[] }>(DESKTOP_IPC.workspaceChanged),
  },
  files: {
    tree: () => ipcRenderer.invoke(DESKTOP_IPC.filesTree),
    read: (path: string) => ipcRenderer.invoke(DESKTOP_IPC.filesRead, path),
    write: (path: string, content: string) => ipcRenderer.invoke(DESKTOP_IPC.filesWrite, path, content),
    snapshot: () => ipcRenderer.invoke(DESKTOP_IPC.filesSnapshot),
    sync: (entries: Array<{ path: string; content: string }>) => ipcRenderer.invoke(DESKTOP_IPC.filesSync, entries),
  },
  pty: {
    open: (size: { cols: number; rows: number }) => ipcRenderer.invoke(DESKTOP_IPC.ptyOpen, size),
    write: (id: string, data: string) => ipcRenderer.invoke(DESKTOP_IPC.ptyWrite, id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke(DESKTOP_IPC.ptyResize, id, cols, rows),
    close: (id: string) => ipcRenderer.invoke(DESKTOP_IPC.ptyClose, id),
    onData: subscribe<{ id: string; chunk: string }>(DESKTOP_IPC.ptyData),
    onExit: subscribe<{ id: string; exitCode: number }>(DESKTOP_IPC.ptyExit),
  },
  git: {
    run: (request: { action: string; message?: string }) => ipcRenderer.invoke(DESKTOP_IPC.gitRun, request),
  },
  runCollected: (line: string) => ipcRenderer.invoke(DESKTOP_IPC.runCollected, line),
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
