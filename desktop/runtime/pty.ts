import { defaultShell } from "./workspace-policy.js";

/*
 * Streaming terminals for the workspace: one node-pty per open terminal
 * pane, cwd pinned to the workspace, data pushed to the renderer as it
 * arrives. node-pty is loaded lazily and its absence is reported, never
 * papered over — a desk without a terminal says so.
 */

type PtyModule = typeof import("node-pty");
type PtyProcess = import("node-pty").IPty;

let ptyModule: PtyModule | null | undefined;

function loadPty(): PtyModule | null {
  if (ptyModule !== undefined) return ptyModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ptyModule = require("node-pty") as PtyModule;
  } catch (error) {
    console.warn("[quantora-desktop] node-pty unavailable:", (error as Error)?.message || error);
    ptyModule = null;
  }
  return ptyModule;
}

export function ptyAvailable(): boolean {
  return loadPty() !== null;
}

const sessions = new Map<string, PtyProcess>();
let counter = 0;

export type PtyHandlers = {
  onData: (id: string, chunk: string) => void;
  onExit: (id: string, exitCode: number) => void;
};

export function openPty(cwd: string, size: { cols: number; rows: number }, handlers: PtyHandlers): { ok: true; id: string } | { ok: false; error: string } {
  const pty = loadPty();
  if (!pty) return { ok: false, error: "The terminal is unavailable: node-pty did not load on this machine." };
  const shell = defaultShell();
  const id = `pty-${++counter}`;
  try {
    const proc = pty.spawn(shell.command, process.platform === "win32" ? [] : ["-l"], {
      name: "xterm-256color",
      cols: Math.max(20, Math.min(500, Math.floor(size.cols || 80))),
      rows: Math.max(5, Math.min(200, Math.floor(size.rows || 24))),
      cwd,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", QUANTORA_DESKTOP: "1" } as Record<string, string>,
    });
    sessions.set(id, proc);
    proc.onData((chunk) => handlers.onData(id, chunk));
    proc.onExit(({ exitCode }) => {
      sessions.delete(id);
      handlers.onExit(id, exitCode);
    });
    return { ok: true, id };
  } catch (error: any) {
    return { ok: false, error: `The shell could not start: ${error?.message || error}` };
  }
}

export function writePty(id: string, data: string): boolean {
  const proc = sessions.get(id);
  if (!proc) return false;
  proc.write(data);
  return true;
}

export function resizePty(id: string, cols: number, rows: number): boolean {
  const proc = sessions.get(id);
  if (!proc) return false;
  try {
    proc.resize(Math.max(20, Math.min(500, Math.floor(cols))), Math.max(5, Math.min(200, Math.floor(rows))));
    return true;
  } catch {
    return false;
  }
}

export function closePty(id: string): void {
  const proc = sessions.get(id);
  if (!proc) return;
  sessions.delete(id);
  try { proc.kill(); } catch { /* already gone */ }
}

export function closeAllPtys(): void {
  for (const id of [...sessions.keys()]) closePty(id);
}
