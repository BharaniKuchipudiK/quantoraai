import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isValidWorkspaceRelativePath } from "../../shared/desk-runtime-contract.js";
import { resolveInsideRoot } from "./workspace-policy.js";

/*
 * Files inside the attached workspace: the tree the sidebar shows, single
 * reads and writes for the editor, and the text snapshot the chat sends as
 * the desk's files. Every path is confined to the root in this module; the
 * renderer only ever sees workspace-relative paths.
 */

/** Never listed, never snapshotted. The user's editor ignores them too. */
export const IGNORED_DIRECTORIES = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt", "out", "coverage", ".cache",
  ".turbo", ".parcel-cache", "__pycache__", ".venv", "venv", "target", ".idea", ".vscode", ".DS_Store",
]);

export const TREE_MAX_ENTRIES = 5000;
export const TREE_MAX_DEPTH = 12;

export type TreeEntry = { path: string; name: string; kind: "file" | "dir"; size?: number };

export function listWorkspaceTree(root: string): { entries: TreeEntry[]; truncated: boolean } {
  const entries: TreeEntry[] = [];
  let truncated = false;

  const walk = (relative: string, depth: number) => {
    if (truncated || depth > TREE_MAX_DEPTH) return;
    const absolute = relative ? path.join(root, relative) : root;
    let names: string[];
    try {
      names = readdirSync(absolute).sort((a, b) => a.localeCompare(b));
    } catch {
      return;
    }
    for (const name of names) {
      if (IGNORED_DIRECTORIES.has(name)) continue;
      if (entries.length >= TREE_MAX_ENTRIES) { truncated = true; return; }
      const childRelative = relative ? `${relative}/${name}` : name;
      let stat;
      try {
        stat = statSync(path.join(absolute, name));
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        entries.push({ path: childRelative, name, kind: "dir" });
        walk(childRelative, depth + 1);
      } else if (stat.isFile()) {
        entries.push({ path: childRelative, name, kind: "file", size: stat.size });
      }
    }
  };
  walk("", 0);
  return { entries, truncated };
}

export type ReadResult = { ok: true; content: string } | { ok: false; error: string };

export function readWorkspaceFile(root: string, relativePath: unknown): ReadResult {
  if (!isValidWorkspaceRelativePath(relativePath)) return { ok: false, error: "Not a workspace path." };
  const absolute = resolveInsideRoot(root, relativePath as string);
  if (!absolute) return { ok: false, error: "Outside the workspace." };
  try {
    const buffer = readFileSync(absolute);
    if (buffer.includes(0)) return { ok: false, error: "Binary file." };
    return { ok: true, content: buffer.toString("utf8") };
  } catch (error: any) {
    return { ok: false, error: error?.code === "ENOENT" ? "File not found." : String(error?.message || error) };
  }
}

export function writeWorkspaceFile(root: string, relativePath: unknown, content: unknown): { ok: true } | { ok: false; error: string } {
  if (!isValidWorkspaceRelativePath(relativePath)) return { ok: false, error: "Not a workspace path." };
  if (typeof content !== "string") return { ok: false, error: "Content must be text." };
  const absolute = resolveInsideRoot(root, relativePath as string);
  if (!absolute) return { ok: false, error: "Outside the workspace." };
  try {
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/*
 * The desk's view of the folder: text files the model may read and edit.
 * Bounded so a large repository does not become a multi-megabyte prompt;
 * the cap is reported, never silently applied.
 */
export const SNAPSHOT_MAX_FILES = 400;
export const SNAPSHOT_MAX_FILE_BYTES = 200 * 1024;
export const SNAPSHOT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".md", ".mdx", ".txt", ".yml", ".yaml", ".toml", ".xml", ".svg", ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".swift", ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".sh", ".env.example", ".sql", ".graphql", ".vue", ".svelte",
  ".astro", ".prisma", ".ini", ".cfg", ".conf", ".gitignore", ".editorconfig", ".npmrc", ".nvmrc",
]);

function looksTextual(name: string): boolean {
  const lower = name.toLowerCase();
  if (TEXT_EXTENSIONS.has(path.extname(lower))) return true;
  return [".gitignore", ".editorconfig", ".npmrc", ".nvmrc", "dockerfile", "makefile", "license", "readme"]
    .some((special) => lower === special || lower.startsWith(`${special}.`));
}

export type VfsFile = { content: string; language: string };
export type Snapshot = { vfs: Record<string, VfsFile>; files: number; bytes: number; truncated: boolean };

export function languageForPath(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  const map: Record<string, string> = {
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".json": "json", ".html": "html", ".htm": "html",
    ".css": "css", ".scss": "scss", ".md": "markdown", ".py": "python", ".yml": "yaml", ".yaml": "yaml",
    ".sh": "shell", ".go": "go", ".rs": "rust", ".java": "java", ".sql": "sql", ".svg": "xml", ".xml": "xml",
  };
  return map[ext] || "plaintext";
}

export function snapshotWorkspace(root: string): Snapshot {
  const { entries } = listWorkspaceTree(root);
  const vfs: Record<string, VfsFile> = {};
  let files = 0;
  let bytes = 0;
  let truncated = false;
  for (const entry of entries) {
    if (entry.kind !== "file" || !looksTextual(entry.name)) continue;
    if ((entry.size ?? 0) > SNAPSHOT_MAX_FILE_BYTES) continue;
    if (files >= SNAPSHOT_MAX_FILES || bytes + (entry.size ?? 0) > SNAPSHOT_MAX_TOTAL_BYTES) { truncated = true; break; }
    const read = readWorkspaceFile(root, entry.path);
    if (!read.ok) continue;
    vfs[entry.path] = { content: read.content, language: languageForPath(entry.path) };
    files += 1;
    bytes += Buffer.byteLength(read.content, "utf8");
  }
  return { vfs, files, bytes, truncated };
}
