/**
 * The one sandbox tool the model may call: clone a repository into a REAL,
 * ephemeral cloud Linux VM, run the caller's own commands (install, build,
 * test — whatever the repository actually uses), and report the real exit
 * code and output. Then the sandbox is destroyed.
 *
 * WHY THIS EXISTS
 *
 * Every write tool before this one (`github-write-agent-tools.ts`) could push
 * files and open a pull request, but nothing on this platform could actually
 * RUN the repository's own build or test command first. `deployFixPersona` in
 * chat-handler.ts had to tell the model, honestly, that it could not claim to
 * have tested a fix before pushing it — because there was truly nowhere to
 * run it. This tool is what makes that claim finally available to make
 * honestly: a real command, in a real (if temporary) machine, with a real
 * exit code — not a guess and not `esbuild`'s syntax-only parse check
 * (`code-syntax-guard.ts`), which never executes anything.
 *
 * WHAT THIS IS NOT
 *
 * - NOT the user's own computer. It is a throwaway Vercel Sandbox microVM
 *   that exists only for the duration of this call and is always destroyed
 *   afterward (`finally`), win or lose.
 * - NOT unlimited. It is bounded by SANDBOX_WALL_CLOCK_MS below and by
 *   whatever tool-time budget remains in the turn (enforced by the caller in
 *   tool-registry.ts, same as every other tool family).
 * - NOT a merge or a deploy. It never pushes anything and never talks to
 *   Vercel's deployment API; it only clones, runs commands, and reports.
 *
 * WHAT AUTHORIZES A CLONE OF A PRIVATE REPOSITORY
 *
 * The signed-in user's own GitHub principal (`githubPrincipal`), the same
 * credential `github-write-agent-tools.ts` already uses to push. Passed to
 * the sandbox as HTTP Basic auth on the git remote (`username`/`password`
 * fields on `source`, never baked into the URL string), so cloning a
 * repository the user cannot read fails exactly the way it would from their
 * own terminal — GitHub enforces it, this tool does not re-implement it.
 *
 * WHAT GATES WHETHER THIS TOOL IS EVEN OFFERED
 *
 * `resolveSandboxCredentials()` in sandbox-credentials.ts must return a real
 * VERCEL_SANDBOX_TOKEN/VERCEL_ACCESS_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID
 * triple, AND the user must have a GitHub connection (there is no legitimate
 * reason to run a sandbox with nothing to clone). Until an operator adds
 * VERCEL_TEAM_ID and VERCEL_PROJECT_ID to this platform's environment, this
 * resolves to null and the tool is never offered — see sandbox-credentials.ts
 * for why those two specifically are the missing piece.
 *
 * A REAL, STATED LIMITATION OF THIS FILE AS WRITTEN
 *
 * No live Vercel Sandbox has been created or exercised while writing this —
 * VERCEL_TEAM_ID/VERCEL_PROJECT_ID do not exist in this development
 * environment. `sandboxFactory` is dependency-injected specifically so tests
 * can prove the clone/run/cleanup CONTRACT against a fake, but nobody should
 * read a passing test here as "this was run against Vercel's real
 * infrastructure" — it was not. That is the one honest gap left for whoever
 * adds the three environment variables to close, by running this once for
 * real and watching it work.
 */
import type { GithubPrincipal } from "./github-principal.js";
import type { SandboxCredentials } from "./sandbox-credentials.js";

/** Minimal shape this file needs from `@vercel/sandbox`'s `Sandbox`, so tests can substitute a fake. */
export interface SandboxHandle {
  runCommand(params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
  }): Promise<{ exitCode: number; output(stream: "both"): Promise<string> }>;
  stop(): Promise<void>;
}

export type SandboxFactory = (params: {
  source: { type: "git"; url: string; username: string; password: string; depth?: number; revision?: string };
  timeout: number;
  resources: { vcpus: number };
  token: string;
  teamId: string;
  projectId: string;
}) => Promise<SandboxHandle>;

/** How long the sandbox VM itself is allowed to live, wall-clock, before Vercel kills it regardless of what is running. */
const SANDBOX_WALL_CLOCK_MS = 4 * 60_000;
/** How long any single command inside it may run before this tool kills that command specifically. */
const COMMAND_TIMEOUT_MS = 3 * 60_000;
/** Kept small: this is read by a model in a chat turn, not a CI dashboard. */
const MAX_OUTPUT_CHARS = 6_000;
const MAX_COMMANDS = 6;

function truncate(text: string): { text: string; truncated: boolean } {
  const value = String(text || "");
  if (value.length <= MAX_OUTPUT_CHARS) return { text: value, truncated: false };
  return { text: value.slice(0, MAX_OUTPUT_CHARS), truncated: true };
}

/**
 * Offered only when there is a real repository to clone (a GitHub
 * connection) AND a real place to clone it into (sandbox credentials). A
 * tool that always answers "not configured" is the exact shape of promise
 * this repo's doctrine warns against making to a model.
 */
export function shouldEnableSandboxTools(input: {
  hasGithubConnection?: boolean;
  sandboxConfigured?: boolean;
} = {}): boolean {
  return input.hasGithubConnection === true && input.sandboxConfigured === true;
}

/*
 * DESCRIPTIONS ARE PROMISES — see github-agent-tools.ts for the incident this
 * rule closes, and sandbox-tool-promise.test.ts for the check that this
 * string matches what the executor below actually does.
 */
export const sandboxFunctionDeclarations: any[] = [
  {
    name: "run_repository_check",
    description:
      "Clone a GitHub repository into a real, temporary, isolated cloud Linux machine (a Vercel Sandbox) and run one or more shell commands in it — e.g. installing dependencies, building, or running the repository's own test suite. Returns each command's real exit code and up to 6000 characters of its combined stdout+stderr, truncated if longer. The machine is destroyed immediately after, whether commands succeed or fail. REQUIRED before ever telling the user a fix was 'tested' or 'verified' — a syntax check (push_files_to_repository's built-in parse guard) is NOT a test run, and neither is reading this description. Runs for at most 4 minutes total; a command still running past that is killed and reported as timed out, not as passed or failed. This is NOT the user's own computer, and it never pushes, commits, deploys, or merges anything — it only runs commands and reports what happened.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
        branch: { type: "string", description: "Branch, tag, or commit to check out. Defaults to the repository's default branch." },
        commands: {
          type: "array",
          items: { type: "string" },
          description: "Shell command lines to run in order inside the cloned repository's root, e.g. [\"npm install\", \"npm run build\", \"npm test\"]. Stops at the first command that exits non-zero. Max 6 commands.",
        },
      },
      required: ["owner", "repo", "commands"],
    },
  },
];

export interface SandboxToolContext {
  principal: GithubPrincipal | null;
  credentials: SandboxCredentials | null;
  /** Injectable for tests; defaults to the real `@vercel/sandbox` Sandbox.create in production wiring (tool-registry.ts). */
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
    // Reached only if the enable-gate and the call-site guard both let this
    // through. Fails closed and says the actionable thing.
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
    if (sandbox) {
      await sandbox.stop().catch(() => {});
    }
  }
}
