import { spawn } from "node:child_process";
import { isDeskGitAction } from "../../shared/desk-runtime-contract.js";
import { isCloneableRepositoryUrl } from "../../shared/desktop-bridge-contract.js";
import { capOutput, stripAnsi } from "./workspace-policy.js";
import { DESK_OUTPUT_MAX_BYTES } from "../../shared/desk-runtime-contract.js";

/*
 * Real git in the attached folder — the four verbs the desk offers, nothing
 * that leaves the machine. Output keeps git's own wording so the pane's
 * classifiers (diff hunks, "not a git repository") keep working, and a
 * missing binary is reported as exactly that.
 */

export type GitResult = { ok: boolean; output: string };

function git(args: string[], cwd: string): Promise<{ code: number | null; output: string; spawnError?: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1", TERM: "dumb" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.on("error", (error) => resolve({ code: null, output: "", spawnError: error.message }));
    child.on("close", (code) => resolve({ code, output: capOutput(stripAnsi(output).trimEnd(), DESK_OUTPUT_MAX_BYTES) }));
  });
}

const IDENTITY = ["-c", "user.name=Quantora Desk", "-c", "user.email=desk@quantoraai.app"];

export async function runDeskGitOnDisk(
  action: unknown,
  message: unknown,
  cwd: string,
): Promise<GitResult> {
  if (!isDeskGitAction(action)) {
    return { ok: false, output: "This desk only runs git status, diff, commit, and start git for this app." };
  }

  if (action === "init") {
    const result = await git(["init", "-q"], cwd);
    if (result.spawnError) return { ok: false, output: `git is not installed on this machine (${result.spawnError}).` };
    if (result.code !== 0) return { ok: false, output: result.output || "git init failed." };
    return { ok: true, output: ["Git is ready in this folder.", result.output].filter(Boolean).join("\n") };
  }

  if (action === "status") {
    const result = await git(["status", "--short", "--branch"], cwd);
    if (result.spawnError) return { ok: false, output: `git is not installed on this machine (${result.spawnError}).` };
    return { ok: result.code === 0, output: result.output || "## working tree clean" };
  }

  if (action === "diff") {
    const tracked = await git(["--no-pager", "diff"], cwd);
    if (tracked.spawnError) return { ok: false, output: `git is not installed on this machine (${tracked.spawnError}).` };
    if (tracked.code !== 0) return { ok: false, output: tracked.output };
    const untracked = await git(["ls-files", "--others", "--exclude-standard"], cwd);
    const lines = [tracked.output, ...untracked.output.split("\n").filter(Boolean).map((file) => `?? ${file}`)].filter(Boolean);
    return { ok: true, output: lines.length ? lines.join("\n") : "working tree clean" };
  }

  const commitMessage = String(message || "").trim();
  if (!commitMessage) return { ok: false, output: "Commit needs a real message. Git did not run." };
  if (/\n/.test(commitMessage)) return { ok: false, output: "Commit message must be a single line." };

  const add = await git(["add", "-A"], cwd);
  if (add.spawnError) return { ok: false, output: `git is not installed on this machine (${add.spawnError}).` };
  if (add.code !== 0) return { ok: false, output: add.output || "git add failed." };
  const commit = await git([...IDENTITY, "commit", "-q", "-m", commitMessage], cwd);
  if (commit.code !== 0) return { ok: false, output: commit.output || "git commit failed." };
  const head = await git(["log", "-1", "--oneline"], cwd);
  return { ok: true, output: [head.output, commit.output].filter(Boolean).join("\n") };
}

/** `git clone <url> <destination>`; the destination is chosen by a native dialog, never by the page. */
export async function cloneRepository(url: unknown, destination: string): Promise<GitResult> {
  if (!isCloneableRepositoryUrl(url)) return { ok: false, output: "That is not a repository URL this desk will clone." };
  const parent = destination.replace(/[\\/][^\\/]+$/, "");
  const result = await git(["clone", "--progress", String(url), destination], parent);
  if (result.spawnError) return { ok: false, output: `git is not installed on this machine (${result.spawnError}).` };
  return { ok: result.code === 0, output: result.output || (result.code === 0 ? `Cloned into ${destination}` : "git clone failed.") };
}
