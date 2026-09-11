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
 *
 * WHAT AUTHORIZES THESE
 *
 * The signed-in user's own GitHub connection — the same sealed principal
 * `github-agent-tools.ts` reads with. There is no Quantora token and no
 * service account here either.
 */
import {
  createPullRequest,
  pushFilesToRepository,
  type GithubWriteContext,
} from "./github-actions.js";
import type { FetchLike, GithubPrincipal } from "./github-principal.js";

/**
 * Tools are offered only to a user who has actually connected GitHub — same
 * rule as the read tools, for the same reason: a model holding a tool that
 * always errors starts explaining the error as though it were a fact about
 * the repository.
 */
export function shouldEnableGithubWriteTools(input: { hasGithubConnection?: boolean } = {}): boolean {
  return input.hasGithubConnection === true;
}

/*
 * DESCRIPTIONS ARE PROMISES — see github-agent-tools.ts for the incident this
 * rule closes. `github-write-tool-promise.test.ts` checks these strings
 * against the shapes the executor really returns.
 */
export const githubWriteFunctionDeclarations: any[] = [
  {
    name: "push_files_to_repository",
    description:
      "Commit one or more files to a branch on the signed-in user's GitHub repository, as one commit. Creates the branch from the repository's default branch if it does not already exist. REQUIRED before create_pull_request when the head branch is not already on GitHub. Returns: the new commit SHA, the branch name, how many files were committed, whether the branch was just created, and the commit's URL. Does NOT open a pull request — call create_pull_request for that. Fails closed if the signed-in user cannot write to this repository; it never silently commits as someone else.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
        branch: { type: "string", description: "Branch to commit to. Created from the default branch if it does not exist." },
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
      "Open a pull request on the signed-in user's GitHub repository, from a branch that already exists on GitHub (push it first with push_files_to_repository if it does not). Returns: the pull request's number, URL, state, and the permission GitHub reported for this write. Does NOT merge, comment, or request review — it only opens the pull request. Merging always requires the human to click merge themselves; no tool exists here that can do it. Fails closed if the signed-in user cannot write to this repository.",
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

/**
 * A failure the MODEL reads, and therefore a failure the USER reads. Says
 * what was attempted and what GitHub said, and never softens a refusal into
 * something that sounds like it happened anyway.
 */
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
    // Reached only if the enable-gate and the call-site guard both let this
    // through. Fails closed and says the actionable thing.
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
        const result = await pushFilesToRepository(writeContext, {
          files: Array.isArray(args?.files) ? args.files : [],
          message: String(args?.message || ""),
          branch: typeof args?.branch === "string" ? args.branch : undefined,
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
          // Opened as ready-for-review, not draft: a fix that has already
          // passed the model's own reasoning is being handed to a human to
          // merge, not parked for the user to remember to un-draft.
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
