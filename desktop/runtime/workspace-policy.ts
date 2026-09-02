import path from "node:path";

/*
 * Pure path confinement for the attached workspace (design §6.2, §9).
 * Every path the renderer sends is resolved here, in the main process, and
 * must land strictly inside the attached root. Symlinks are handled by the
 * caller resolving the root with realpath once at attach time.
 */

/** Absolute path inside `root`, or null if the relative path would escape. */
export function resolveInsideRoot(root: string, relativePath: string): string | null {
  if (!root || !relativePath) return null;
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relativePath);
  if (candidate === absoluteRoot) return null;
  return candidate.startsWith(absoluteRoot + path.sep) ? candidate : null;
}

/** Terminal escape sequences add nothing to a plain-text log. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\][^]*/g, "");
}

/** Cap collected output, keeping the tail — the end is where the error is. */
export function capOutput(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const tail = Buffer.from(text, "utf8").subarray(-maxBytes).toString("utf8");
  return `…(output truncated to the last ${maxBytes} bytes)\n${tail}`;
}

/** The user's login shell, or a safe default per platform. */
export function defaultShell(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): { command: string; args: string[] } {
  if (platform === "win32") {
    return { command: env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c"] };
  }
  return { command: env.SHELL || "/bin/sh", args: ["-c"] };
}
