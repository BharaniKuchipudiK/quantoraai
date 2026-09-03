import { IGNORED_DIRECTORIES } from "./files.js";

/*
 * External-change watcher: the user will open the same folder in VS Code
 * or run a generator in the terminal, and the sidebar and open editors must
 * follow. chokidar is loaded lazily and its absence reported, like node-pty.
 */

type Chokidar = typeof import("chokidar");
type Watcher = import("chokidar").FSWatcher;

let chokidar: Chokidar | null | undefined;
function loadChokidar(): Chokidar | null {
  if (chokidar !== undefined) return chokidar;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    chokidar = require("chokidar") as Chokidar;
  } catch (error) {
    console.warn("[quantora-desktop] chokidar unavailable:", (error as Error)?.message || error);
    chokidar = null;
  }
  return chokidar;
}

let watcher: Watcher | null = null;

export const WATCH_DEBOUNCE_MS = 250;

export function startWatching(root: string, onChanged: (paths: string[]) => void): boolean {
  stopWatching();
  const lib = loadChokidar();
  if (!lib) return false;
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    const paths = [...pending];
    pending.clear();
    if (paths.length) onChanged(paths);
  };
  watcher = lib.watch(root, {
    ignoreInitial: true,
    ignored: (candidate: string) => candidate.split(/[\\/]/).some((segment) => IGNORED_DIRECTORIES.has(segment)),
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  watcher.on("all", (_event: string, changed: string) => {
    const relative = changed.startsWith(root) ? changed.slice(root.length).replace(/^[\\/]+/, "").replace(/\\/g, "/") : changed;
    if (relative) pending.add(relative);
    if (!timer) timer = setTimeout(flush, WATCH_DEBOUNCE_MS);
  });
  return true;
}

export function stopWatching(): void {
  if (!watcher) return;
  void watcher.close();
  watcher = null;
}
