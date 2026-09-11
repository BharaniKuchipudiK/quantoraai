/**
 * A real, free safety net before pushing model-written code: catch a file
 * that cannot even PARSE, before it becomes a commit on someone's repository.
 *
 * WHY THIS EXISTS, AND WHY IT IS SMALLER THAN IT SOUNDS
 *
 * The founder asked for "clone it, write it, test it, prove it, push it" —
 * the full Cursor/Claude Code experience. That needs a real git clone and a
 * real `npm test` run, and Vercel's serverless runtime has neither `git` nor
 * `npm` available at execution time (only bundled Node.js code) — confirmed
 * before writing a line of this, not assumed. Building a check that PRETENDS
 * to run the user's real test suite would be the exact decorative-gate
 * failure this repo's own doctrine warns against: it would cost the same to
 * run as a real one and buy false confidence.
 *
 * What IS honestly possible for free, today, without git or npm: parsing
 * each file the model is about to push with a real JS/TS parser, in memory,
 * and refusing to push anything that does not even parse. This is a strictly
 * smaller claim than "the tests pass" — a file can parse and still be wrong —
 * but it is real, and it catches the single most common way a quick fix
 * breaks a build: a stray brace, an unclosed string, invalid JSX.
 *
 * esbuild is already a dependency here (used to bundle server.ts at build
 * time); `transformSync` runs entirely in memory and needs no filesystem, no
 * network call, and no other process — verified directly before relying on
 * it, per this repo's "reproduce before fixing" rule.
 */
import { transformSync } from "esbuild";

export interface SyntaxCheckFile {
  path: string;
  content: string;
}

export interface SyntaxCheckFailure {
  path: string;
  error: string;
}

export interface SyntaxCheckResult {
  ok: boolean;
  failures: SyntaxCheckFailure[];
  /** Paths this check did not examine at all — an unsupported extension is not a pass. */
  skipped: string[];
}

const LOADER_BY_EXTENSION: Record<string, "ts" | "tsx" | "js" | "jsx"> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".mts": "ts",
  ".cts": "ts",
  ".js": "js",
  ".jsx": "jsx",
  ".mjs": "js",
  ".cjs": "js",
};

function extensionOf(path: string): string {
  const clean = String(path || "").split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot).toLowerCase() : "";
}

/**
 * Checks every file this loader recognises (JS/TS/JSX/TSX and JSON) and
 * leaves everything else untouched in `skipped` — an unsupported file is
 * reported as unchecked, never silently counted as passing.
 */
export function checkFilesParse(files: SyntaxCheckFile[]): SyntaxCheckResult {
  const failures: SyntaxCheckFailure[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const ext = extensionOf(file.path);
    if (ext === ".json") {
      try {
        JSON.parse(file.content);
      } catch (error) {
        failures.push({ path: file.path, error: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }
    const loader = LOADER_BY_EXTENSION[ext];
    if (!loader) {
      skipped.push(file.path);
      continue;
    }
    try {
      transformSync(file.content, { loader, sourcefile: file.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // esbuild's own message already names the line; keep only the first
      // line so a chat surface does not get esbuild's full stack of frames.
      failures.push({ path: file.path, error: message.split("\n")[0] });
    }
  }

  return { ok: failures.length === 0, failures, skipped };
}
