import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateDeskSyncEntries } from "../../shared/desk-runtime-contract.js";
import { resolveInsideRoot } from "./workspace-policy.js";

/*
 * The attached workspace: one real folder per desktop session (design §6.2).
 *
 * The desk's VFS is the model's view; the folder is the truth once attached.
 * Sync writes the desk's files into the folder before every shell or git
 * action — the same order of events WebContainer uses — so what the shell
 * sees is exactly what Preview is running. Nothing is ever deleted by sync:
 * a file the user created in their editor is not the desk's to remove.
 */

let root: string | null = null;

export type WorkspaceInfo = { attached: boolean; root: string | null };

export function attachWorkspace(folder: string): WorkspaceInfo {
  const resolved = realpathSync(path.resolve(folder));
  if (!statSync(resolved).isDirectory()) throw new Error("Not a folder.");
  root = resolved;
  return workspaceInfo();
}

export function detachWorkspace(): WorkspaceInfo {
  root = null;
  return workspaceInfo();
}

export function workspaceInfo(): WorkspaceInfo {
  return { attached: root !== null, root };
}

export function workspaceRoot(): string {
  if (!root) throw new Error("No folder is attached to this desk.");
  return root;
}

export type SyncResult = { ok: true; written: number } | { ok: false; error: string };

export function syncWorkspaceFiles(entries: unknown): SyncResult {
  if (!root) return { ok: false, error: "No folder is attached to this desk." };
  const validated = validateDeskSyncEntries(entries);
  if (!validated.ok || !validated.entries) return { ok: false, error: `Refused to sync: ${validated.reason || "invalid entries"}.` };

  // Resolve every path first; a batch with one escape writes nothing.
  const targets: Array<{ absolute: string; content: string }> = [];
  for (const entry of validated.entries) {
    const absolute = resolveInsideRoot(root, entry.path);
    if (!absolute) return { ok: false, error: `Refused to sync: ${entry.path} is outside the attached folder.` };
    targets.push({ absolute, content: entry.content });
  }
  for (const { absolute, content } of targets) {
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  return { ok: true, written: targets.length };
}
