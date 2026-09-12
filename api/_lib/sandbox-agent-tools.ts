/**
 * Real repository execution in an ephemeral Vercel Sandbox.
 *
 * Chat tools clone a connected GitHub repository and run caller-selected
 * commands. QIR also reuses the same sandbox contract, but creates a clean VM
 * and writes the exact durable candidate VFS into it before running the
 * repository's own checks. Both paths are isolated and always tear the VM down.
 */
import type { GithubPrincipal } from "./github-principal.js";
import type { SandboxCredentials } from "./sandbox-credentials.js";

export interface SandboxHandle {
  runCommand(params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
  }): Promise<{ exitCode: number; output(stream: "both"): Promise<string> }>;
  /** Write concrete candidate bytes into the isolated workspace. */
  writeFiles?(files: Array<{ path: string; content: Buffer }>): Promise<void>;
  stop(): Promise<void>;
}

export type SandboxFactory = (params: {
  /** Optional because QIR can execute an already-hydrated durable VFS. */
  source?: { type: "git"; url: string; username: string; password: string; depth?: number; revision?: string };
  timeout: number;
  resources: { vcpus: number };
  token: string;
  teamId: string;
  projectId: string;
}) => Promise<SandboxHandle>;

const SANDBOX_WALL_CLOCK_MS = 4 * 60_000;
const COMMAND_TIMEOUT_MS = 3 * 60_000;
const MAX_OUTPUT_CHARS = 6_000;
const MAX_COMMANDS = 6;

function truncate(text: string): { text: string; truncated: boolean } {
  const value = String(text || "");
  if (value.length <= MAX_OUTPUT_CHARS) return { text: value, truncated: false };
  return { text: value.slice(0, MAX_OUTPUT_CHARS), truncated: true };
}

export function shouldEnableSandboxTools(input: {
  hasGithubConnection?: boolean;
  sandboxConfigured?: boolean;
} = {}): boolean {
  return input.hasGithubConnection === true && input.sandboxConfigured === true;
}

export const sandboxFunctionDeclarations: any[] = [
  {
    name: "run_repository_check",
    description:
      "Clone a GitHub repository into a real, temporary, isolated cloud Linux machine (a Vercel Sandbox) and run one or more shell commands in it — e.g. installing dependencies, building, or running the repository's own test suite. Returns each command's real exit code and up to 6000 characters of its combined stdout+stderr, truncated if longer. The machine is destroyed immediately after, whether commands succeed or fail. REQUIRED before ever telling the user a fix was 'tested' or 'verified' — a syntax check is NOT a test run. Runs for at most 4 minutes total; a command still running past that is killed and reported as timed out. This is NOT the user's own computer, and it never pushes, commits, deploys, or merges anything — it only runs commands and reports what happened.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
        branch: { type: "string", description: "Branch, tag, or commit to check out. Defaults to the repository's default branch." },
        commands: {
          type: "array",
          items: { type: "string" },
          description: "Shell command lines to run in order inside the cloned repository's root. Stops at the first command that exits non-zero. Max 6 commands.",
        },
      },
      required: ["owner", "repo", "commands"],
    },
  },
];

export interface SandboxToolContext {
  principal: GithubPrincipal | null;
  credentials: SandboxCredentials | null;
  sandboxFactory: SandboxFactory;
}

export async function executeSandboxToolCall(name: string, args: any, context: SandboxToolContext): Promise<any> {
  if (name !== "run_repository_check") {
    return {
      ok: false,
      status: "failed",
      error: `${name} is not a sandbox tool Quantora serves.`,
      note: "Do not describe any repository check as run; nothing executed.",
    };
  }

  const principal = context?.principal || null;
  const credentials = context?.credentials || null;
  if (!principal || !credentials) {
    return {
      ok: false,
      status: "not_connected",
      error: "The sandbox is not configured or GitHub is not connected.",
      note: "Tell the user real repository checks are unavailable right now; do not claim to have run any command.",
    };
  }

  const owner = String(args?.owner || "").trim();
  const repo = String(args?.repo || "").trim();
  const branch = typeof args?.branch === "string" && args.branch.trim() ? args.branch.trim() : undefined;
  const commands = Array.isArray(args?.commands)
    ? args.commands.map((c: unknown) => String(c || "").trim()).filter(Boolean)
    : [];

  if (!owner || !repo) {
    return { ok: false, status: "failed", error: "owner and repo are required.", note: "Nothing was run." };
  }
  if (commands.length === 0) {
    return { ok: false, status: "failed", error: "At least one command is required.", note: "Nothing was run." };
  }
  if (commands.length > MAX_COMMANDS) {
    return {
      ok: false,
      status: "failed",
      error: `Too many commands (${commands.length}); at most ${MAX_COMMANDS} are allowed per call.`,
      note: "Nothing was run. Split this across multiple calls.",
    };
  }

  let sandbox: SandboxHandle | null = null;
  try {
    sandbox = await context.sandboxFactory({
      source: {
        type: "git",
        url: `https://github.com/${owner}/${repo}.git`,
        username: principal.login,
        password: principal.token,
        depth: 1,
        ...(branch ? { revision: branch } : {}),
      },
      timeout: SANDBOX_WALL_CLOCK_MS,
      resources: { vcpus: 2 },
      token: credentials.token,
      teamId: credentials.teamId,
      projectId: credentials.projectId,
    });

    const results: Array<{ command: string; exitCode: number; output: string; outputTruncated: boolean }> = [];
    let stoppedEarly = false;

    for (const command of commands) {
      const finished = await sandbox.runCommand({
        cmd: "bash",
        args: ["-lc", command],
        timeoutMs: COMMAND_TIMEOUT_MS,
      });
      const raw = await finished.output("both");
      const { text, truncated } = truncate(raw);
      results.push({ command, exitCode: finished.exitCode, output: text, outputTruncated: truncated });
      if (finished.exitCode !== 0) {
        stoppedEarly = true;
        break;
      }
    }

    const allPassed = results.length === commands.length && results.every((r) => r.exitCode === 0);
    return {
      ok: true,
      status: "ran",
      owner,
      repo,
      branch: branch || "(default)",
      allCommandsPassed: allPassed,
      stoppedAtFirstFailure: stoppedEarly,
      results,
      note: allPassed
        ? "Every command exited 0. This is real evidence the check passed — you may now say so."
        : "At least one command failed or was never reached. Report exactly which command and its exit code; do not describe this as passing.",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || "unknown error");
    return {
      ok: false,
      status: "failed",
      error: detail,
      note: "The sandbox could not be created or a command could not be run. This is a failure to check, not a statement that the repository is broken.",
    };
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}
