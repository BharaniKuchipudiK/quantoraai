import { app, dialog } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { attachWorkspace, detachWorkspace, workspaceInfo } from "../runtime/workspace.js";
import { getMainWindow } from "./window.js";

/*
 * Opening and remembering workspaces (the launcher's job). The recent list
 * lives in userData; a folder that no longer exists is dropped when read.
 */

export type RecentWorkspace = { path: string; name: string; openedAt: number };

const MAX_RECENT = 12;

function recentFile(): string {
  return path.join(app.getPath("userData"), "recent-workspaces.json");
}

export function readRecentWorkspaces(): RecentWorkspace[] {
  try {
    const parsed = JSON.parse(readFileSync(recentFile(), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && typeof item.path === "string")
      .filter((item: any) => existsSync(item.path))
      .map((item: any) => ({ path: item.path, name: String(item.name || path.basename(item.path)), openedAt: Number(item.openedAt) || 0 }))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function rememberWorkspace(folder: string): void {
  const next = [{ path: folder, name: path.basename(folder), openedAt: Date.now() }, ...readRecentWorkspaces().filter((item) => item.path !== folder)]
    .slice(0, MAX_RECENT);
  try {
    writeFileSync(recentFile(), JSON.stringify(next));
  } catch {
    /* a lost recent list is a cosmetic loss */
  }
}

export type OpenOutcome = ReturnType<typeof workspaceInfo> & { cancelled?: boolean; error?: string };

export function openWorkspacePath(folder: string): OpenOutcome {
  try {
    const info = attachWorkspace(folder);
    rememberWorkspace(info.root as string);
    return { ...info, cancelled: false };
  } catch (error: any) {
    return { ...workspaceInfo(), cancelled: false, error: error?.message || "Could not open that folder." };
  }
}

export async function pickAndOpenWorkspace(preapproved?: string): Promise<OpenOutcome> {
  if (preapproved) return openWorkspacePath(preapproved);
  const win = getMainWindow();
  const picked = await dialog.showOpenDialog(win ?? (undefined as any), {
    title: "Open folder",
    buttonLabel: "Open",
    properties: ["openDirectory", "createDirectory"],
  });
  if (picked.canceled || !picked.filePaths[0]) return { ...workspaceInfo(), cancelled: true };
  return openWorkspacePath(picked.filePaths[0]);
}

export function closeWorkspace(): ReturnType<typeof workspaceInfo> {
  return detachWorkspace();
}

/** Where a clone lands: a picked parent folder plus the repository name. */
export async function pickCloneDestination(repositoryUrl: string): Promise<string | null> {
  const win = getMainWindow();
  const picked = await dialog.showOpenDialog(win ?? (undefined as any), {
    title: "Clone into",
    buttonLabel: "Clone here",
    properties: ["openDirectory", "createDirectory"],
  });
  if (picked.canceled || !picked.filePaths[0]) return null;
  const name = repositoryUrl.replace(/\/+$/, "").split(/[/:]/).pop()?.replace(/\.git$/, "") || "repository";
  return path.join(picked.filePaths[0], name);
}
