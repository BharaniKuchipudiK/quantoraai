/**
 * GitHub WRITE tools the MODEL can call — push a fix, then open it as a
 * pull request. Merge is deliberately absent.
 *
 * WHY THIS EXISTS, AND WHY IT IS A SEPARATE FILE FROM github-agent-tools.ts
 *
 * `github-agent-tools.ts` carries a structural gate — `github-tool-promise.test.ts`
 * asserts it imports nothing that writes — that made "read-only, deliberately"
 * a fact a test enforces, not a comment someone could out-of-date. Writes get
 * their own module rather than breaking that gate, so a reviewer can still see
 * at a glance which file can only ever read.
 *
 * WHAT THIS EXPOSES, AND WHAT IT DOES NOT
 *
 * `push_files_to_repository` and `create_pull_request`. The model may push a
 * fix and open it as a pull request without a separate confirmation step —
 * GitHub's own permission check (`authorizeWrite`, underneath both calls) is
 * the boundary: a repository the signed-in user cannot write to refuses the
 * call, credential-token-first, the same way every write already worked
 * before a model could reach it.
 *
 * `merge_pull_request` is not declared here and never will be by this module.
 * That is a product decision, not a technical gap: opening a pull request is
 * reversible by closing it; merging is not, in the ordinary case, without a
 * human review of what is about to land on the default branch. A human clicks
 * merge. This file cannot change that no matter what the model decides.
 */
import {
  createPullRequest,
  type GithubWriteContext,
} from "./github-actions.js";
import { pushFilesToRepositoryFromBase } from './github-push-from-base.js';
import type { FetchLike, GithubPrincipal } from "./github-principal.js";
import { checkFilesParse } from "./code-syntax-guard.js";

/**
 * Tools are offered only when BOTH are true: a GitHub connection exists, and
 * the user has separately turned on autonomous writes.
 */
export function shouldEnableGithubWriteTools(input: { hasGithubConnection?: boolean; autoPrOptedIn?: boolean } = {}): boolean {
  return input.hasGithubConnection === true && input.autoPrOptedIn === true;
}

export const githubWriteFunctionDeclarations: any[] = [
  {
    name: "push_files_to_repository",
    description:
      "Commit one or more files to a branch on the signed-in user's GitHub repository, as one commit. If the work branch does not exist, it is created from baseBranch (or the repository default branch when baseBranch is omitted), so the commit has shared history and can be opened as a normal pull request. Before writing, every JS/TS/JSX/TSX/JSON file is checked for a real parse error and the commit is refused if one is found. Returns: the new commit SHA, branch, file count, whether the branch was created, and its URL. Does NOT open a pull request — call create_pull_request next. This tool never merges.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
        branch: { type: "string", description: "Work branch to commit to. Use a branch different from the PR base." },
        baseBranch: { type: "string", description: "Branch the work branch should be created from when it does not yet exist. Defaults to the repository default branch." },
        message: { type: "string", description: "The commit message. Must describe what changed." },
        files: {
          type: "array",
          description: "Files to write, each replacing whatever is at that path on the branch.",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path inside the repository, e.g. api/handler.ts." },
              content: { type: "string", description: "The full text content of the file." },
            },
            required: ["path", "content"],
          },
        },
      },
      required: ["owner", "repo", "message", "files"],
    },
  },
  {
    name: "create_pull_request",
    description:
      "Open a pull request on the signed-in user's GitHub repository, from a branch that already exists on GitHub (push it first with push_files_to_repository if it does not). Returns: the pull request's number, URL, state, and the permission GitHub reported for this write. Does NOT merge, comment, or request review — it only opens the pull request. Merging always requires the human to click merge themselves; no autonomous merge tool exists here.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
        title: { type: "string", description: "The pull request title." },
        head: { type: "string", description: "The branch with the changes, already on GitHub." },
        base: { type: "string", description: "Optional base branch to merge into. Defaults to the repository's default branch." },
        body: { type: "string", description: "Optional pull request description." },
      },
      required: ["owner", "repo", "title", "head"],
    },
  },
];

function requireText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function toolFailure(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error || "unknown error");
  return {
    ok: false,
    status: "failed",
    action,
    error: detail,
    note: "Nothing was written. Do not tell the user this succeeded, and do not describe a commit or pull request that was not actually created.",
  };
}

export async function executeGithubWriteToolCall(
  name: string,
  args: any,
  context: { principal: GithubPrincipal | null; fetchImpl?: FetchLike },
): Promise<any> {
  const principal = context?.principal;
  if (!principal) {
    return {
      ok: false,
      status: "not_connected",
      error: "This GitHub account is not connected to Quantora.",
      note: "Tell the user to connect GitHub in the composer before you can push or open anything on their repositories.",
    };
  }

  const fetchImpl = context?.fetchImpl;

  try {
    switch (name) {
      case "push_files_to_repository": {
        const owner = requireText(args?.owner, "owner");
        const repo = requireText(args?.repo, "repo");
        const writeContext: GithubWriteContext = { principal, owner, repo, fetchImpl };
        const filesToWrite = Array.isArray(args?.files) ? args.files : [];
        const syntaxCheck = checkFilesParse(filesToWrite);
        if (!syntaxCheck.ok) {
          return {
            ok: false,
            status: "syntax_error",
            failures: syntaxCheck.failures,
            error: `${syntaxCheck.failures.length} file(s) do not parse and were NOT pushed.`,
            note: "Nothing was written to GitHub. Fix the syntax error(s) listed and call push_files_to_repository again. This check only confirms the file parses — it is not a test run.",
          };
        }
        const result = await pushFilesToRepositoryFromBase(writeContext, {
          files: filesToWrite,
          message: String(args?.message || ""),
          branch: typeof args?.branch === "string" ? args.branch : undefined,
          baseBranch: typeof args?.baseBranch === "string" ? args.baseBranch : undefined,
        });
        return {
          ok: true,
          status: "written",
          commitSha: result.commitSha,
          branch: result.branch,
          fileCount: result.fileCount,
          createdBranch: result.createdBranch,
          htmlUrl: result.htmlUrl,
        };
      }

      case "create_pull_request": {
        const owner = requireText(args?.owner, "owner");
        const repo = requireText(args?.repo, "repo");
        const writeContext: GithubWriteContext = { principal, owner, repo, fetchImpl };
        const result = await createPullRequest(writeContext, {
          title: String(args?.title || ""),
          head: String(args?.head || ""),
          base: typeof args?.base === "string" ? args.base : undefined,
          body: typeof args?.body === "string" ? args.body : undefined,
          draft: false,
        });
        return {
          ok: true,
          status: "written",
          pullRequest: result.pullRequest,
          note: "This pull request is OPEN, not merged. Tell the user it is ready for their review; only a human can merge it.",
        };
      }

      default:
        return toolFailure(name, new Error(`${name} is not a GitHub write tool Quantora serves.`));
    }
  } catch (error) {
    return toolFailure(name, error);
  }
}
