import { DESKTOP_BRIDGE_KEY, isDesktopBridge } from "@shared/desktop-bridge-contract.js";

/*
 * Typed access to the host. The preload exposes the object; the contract
 * decides whether it is one this renderer can talk to. A mismatch is a hard
 * error on boot rather than a page that half works.
 */

export type HostCapabilities = {
  folder: boolean;
  shell: boolean;
  terminal: boolean;
  git: boolean;
  notifications: boolean;
  background: boolean;
  watchLoop: boolean;
};

export type HostInfo = { version: string; platform: string; apiOrigin: string; capabilities: HostCapabilities };
export type SessionUser = { name: string; email: string; picture: string; authProvider: string; isAdmin: boolean };
export type AuthStatus = { signedIn: boolean; user: SessionUser | null };
export type WorkspaceInfo = { attached: boolean; root: string | null; capabilities: HostCapabilities; cancelled?: boolean; error?: string };
export type RecentWorkspace = { path: string; name: string; openedAt: number };
export type TreeEntry = { path: string; name: string; kind: "file" | "dir"; size?: number };
export type ReadResult = { ok: true; content: string } | { ok: false; error: string };
export type WriteResult = { ok: true } | { ok: false; error: string };
export type VfsFile = { content: string; language: string };
export type Snapshot = { vfs: Record<string, VfsFile>; files: number; bytes: number; truncated: boolean };
export type SyncResult = { ok: true; written: number } | { ok: false; error: string };
export type RunResult = { ok: boolean; output: string; exitCode: number | null };
export type GitResult = { ok: boolean; output: string };
export type CloneResult = GitResult & { cancelled?: boolean; workspace?: WorkspaceInfo };

export type Bridge = {
  version: number;
  host(): Promise<HostInfo>;
  openExternal(url: string): Promise<{ ok: boolean }>;
  onMenuAction(callback: (action: string) => void): () => void;
  auth: {
    status(): Promise<AuthStatus>;
    signIn(): Promise<{ grantUrl: string }>;
    signOut(): Promise<{ ok: boolean }>;
    onChanged(callback: (payload: { signedIn: boolean }) => void): () => void;
  };
  workspace: {
    info(): Promise<WorkspaceInfo>;
    open(): Promise<WorkspaceInfo>;
    openPath(folder: string): Promise<WorkspaceInfo>;
    close(): Promise<WorkspaceInfo>;
    recent(): Promise<RecentWorkspace[]>;
    clone(url: string): Promise<CloneResult>;
    onChanged(callback: (payload: { paths: string[] }) => void): () => void;
  };
  files: {
    tree(): Promise<{ entries: TreeEntry[]; truncated: boolean }>;
    read(path: string): Promise<ReadResult>;
    write(path: string, content: string): Promise<WriteResult>;
    snapshot(): Promise<Snapshot>;
    sync(entries: Array<{ path: string; content: string }>): Promise<SyncResult>;
  };
  pty: {
    open(size: { cols: number; rows: number }): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
    write(id: string, data: string): Promise<boolean>;
    resize(id: string, cols: number, rows: number): Promise<boolean>;
    close(id: string): Promise<boolean>;
    onData(callback: (payload: { id: string; chunk: string }) => void): () => void;
    onExit(callback: (payload: { id: string; exitCode: number }) => void): () => void;
  };
  git: { run(request: { action: string; message?: string }): Promise<GitResult> };
  runCollected(line: string): Promise<RunResult>;
};

let cached: Bridge | null = null;

export function bridge(): Bridge {
  if (cached) return cached;
  const candidate = (window as unknown as Record<string, unknown>)[DESKTOP_BRIDGE_KEY];
  if (!isDesktopBridge(candidate)) {
    throw new Error("Quantora Desktop bridge is unavailable. This page must run inside the desktop app.");
  }
  cached = candidate as Bridge;
  return cached;
}

export function bridgeAvailable(): boolean {
  try {
    bridge();
    return true;
  } catch {
    return false;
  }
}
