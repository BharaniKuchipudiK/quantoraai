/**
 * GitHub tools the MODEL can call — the half of the integration that was
 * missing.
 *
 * WHY THIS EXISTS
 *
 * Quantora could push a repository, create one, open a pull request, comment,
 * merge, and check a whole project out onto the desk. Every one of those was a
 * button a human pressed. The model's entire tool list was travel:
 *
 *     ask_clarifying_question, get_places_routing,
 *     search_attractions, search_flights, search_hotels
 *
 * So a user could ask "why is my pull request failing?" and the model — sitting
 * on a platform that had already read the answer for the desk panel — had to
 * guess, or ask them to go and look. All the plumbing existed and none of it
 * was connected to the thing doing the reasoning.
 *
 * READ-ONLY, DELIBERATELY, IN THIS FIRST SLICE
 *
 * Every tool here reads. None writes, and no write tool is declared — not even
 * one that refuses.
 *
 * That second point is the deliberate part. Declaring `push_to_github` and
 * having it always decline would be a painted door of exactly the kind this
 * repo has an incident for: `search_hotels` promised photos, returned none, and
 * the model invented "I cannot render embedded photo feeds" to explain the gap.
 * A tool the model is told it has WILL be used, and whatever the platform does
 * with it afterwards, the user reads the model's explanation as fact. A
 * capability that is not ready is better absent than present-and-refusing.
 *
 * Writes need a consent step — the model deciding on its own to push to
 * someone's repository is not a smaller version of reading it, it is a
 * different product decision — and that lands separately.
 *
 * WHAT AUTHORIZES THESE
 *
 * The signed-in user's own GitHub connection, the same sealed principal every
 * button already uses. There is no Quantora token here and no service account:
 * a repository the user cannot see, GitHub refuses, because it is the user's
 * token asking. That is why reads need no permission pre-check the way writes
 * do — the boundary is enforced by the credential, not by our own opinion of it.
 */

import {
  listIssues,
  listPullRequests,
  readPullRequest,
  readRepositoryFile,
  renderPullRequestBrief,
} from "./github-intelligence.js";
import type { FetchLike, GithubPrincipal } from "./github-principal.js";

/*
 * There was a GITHUB_TOOL_NAMES set and an isGithubToolName() beside it, kept
 * in step with the declarations below by hand and by a test. Their only job was
 * to let chat-handler.ts answer "is this call mine?" before choosing an
 * executor. The tool registry (Phase 4) answers that by looking the name up in
 * the one place tools are registered, so a second list of the same strings is
 * now a thing to keep in step for no reader — which is how they drift.
 *
 * The gates that stood on it did not go with it: they moved onto
 * githubFunctionDeclarations itself, which is stronger, because what the model
 * is TOLD it has is the thing that reaches the user.
 */

/**
 * Tools are offered only to a user who has actually connected GitHub.
 *
 * Not a nicety: without a principal every call would fail, and a model holding
 * a tool that always errors starts explaining the error to the user as though
 * it were a fact about their repository.
 */
export function shouldEnableGithubTools(input: { hasGithubConnection?: boolean } = {}): boolean {
  return input.hasGithubConnection === true;
}

/*
 * DESCRIPTIONS ARE PROMISES.
 *
 * Each one below names what comes back and, where it matters, what does NOT.
 * The rule this repo learned the hard way: the model passes an over-promise
 * straight to the user as an invented explanation, so the second half of a
 * description ("returns …") has to be true of the actual payload, not of the
 * feature as someone hopes to ship it later.
 *
 * `github-tool-promise.test.ts` checks these strings against the shapes the
 * executor really returns.
 */
export const githubFunctionDeclarations: any[] = [
  {
    name: "read_pull_request",
    description:
      "Read one pull request on the signed-in user's GitHub account. REQUIRED before answering any question about a specific pull request's state, its CI, or its review feedback — never answer those from memory or from what the user said earlier. Returns: title, author, state, draft flag, head and base branch, head commit SHA, additions/deletions/changed-file count, mergeable status, every CI check with its conclusion and log URL for the failing ones, review verdicts, review threads, and issue comments. Also returns each changed file's path, status, line counts and its diff hunk (truncated for large files). Does NOT return CI log CONTENTS — only the URL to them — and does NOT return whole file contents at a commit. This tool only reads; it cannot push, comment, merge, or change anything.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
        number: { type: "number", description: "The pull request number." },
      },
      required: ["owner", "repo", "number"],
    },
  },
  {
    name: "list_pull_requests",
    description:
      "List pull requests on a repository the signed-in user can access. Use this to find a pull request when the user refers to one without giving its number. Returns for each: number, title, author, state, draft flag, head and base branch, and head commit SHA. Does NOT return diffs, CI results, or review comments — call read_pull_request for those. This tool only reads.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
        state: {
          type: "string",
          description: "Which pull requests to list: 'open' (default), 'closed', or 'all'.",
        },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "list_issues",
    /*
     * No `state` parameter, and that absence is deliberate.
     *
     * listIssues() does not accept one — it lists open issues. Declaring the
     * parameter anyway would let the model set state:"closed", receive open
     * issues, and report them to the user as closed. A knob wired to nothing is
     * worse than a missing knob: the missing one is visible, the dead one lies.
     */
    description:
      "List OPEN issues on a repository the signed-in user can access. Returns for each: number, title, author, state, labels, the issue URL, and when it was last updated. Pull requests are excluded. Cannot list closed issues, and does NOT return issue bodies or comments. This tool only reads.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or organisation login)." },
        repo: { type: "string", description: "Repository name, without the owner prefix." },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "read_repo_file",
    description:
      "Read the text of ONE file in a repository on the signed-in user's GitHub account. REQUIRED before making any claim about what code does — a hardcoded secret, a missing check, whether something is secure, robust, or well tested. The desk shows file NAMES; reviewing names is not reviewing code, so call this for each file you intend to describe. Returns: the file's path, its blob SHA, its size in bytes, a truncated flag, and its text content (64KB by default, 128KB maximum). A file over that cap comes back with truncated=true and you MUST say so rather than concluding anything about the part you were not shown. Reads ONE file per call: it does NOT list a directory, does NOT search, and does NOT return the whole repository. A directory path, a binary file, or a file you cannot see is an error, never empty content. This tool only reads; it cannot push, comment, merge, or change anything.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner: the user or organisation login." },
        repo: { type: "string", description: "Repository name." },
        path: { type: "string", description: "Path to one file inside the repository. Not a directory and not a glob." },
        ref: { type: "string", description: "Optional branch, tag or commit SHA. Defaults to the repository's default branch." },
        maxBytes: { type: "number", description: "Optional cap on bytes returned, 1000 to 128000. Defaults to 64000." },
      },
      required: ["owner", "repo", "path"],
    },
  },
];

function requireText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function normalizeState(value: unknown): "open" | "closed" | "all" {
  const state = String(value ?? "").trim().toLowerCase();
  return state === "closed" || state === "all" ? state : "open";
}

/**
 * A failure the MODEL reads, and therefore a failure the USER reads.
 *
 * It says what was attempted and what GitHub said, and never softens a refusal
 * into something that sounds like an empty result — "no pull requests found" and
 * "you cannot see this repository" lead to opposite next steps, and only one of
 * them is true.
 */
function toolFailure(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error || "unknown error");
  return {
    ok: false,
    status: "failed",
    action,
    error: detail,
    note: "This is a failure to READ, not a statement about the repository. Do not describe the repository as empty, healthy, or unchanged on the strength of it.",
  };
}

export async function executeGithubToolCall(
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
      note: "Tell the user to connect GitHub in the composer before you can read anything from their repositories.",
    };
  }

  const fetchImpl = context?.fetchImpl;

  try {
    switch (name) {
      case "read_pull_request": {
        const owner = requireText(args?.owner, "owner");
        const repo = requireText(args?.repo, "repo");
        const number = Number(args?.number);
        if (!Number.isInteger(number) || number <= 0) {
          throw new Error("number must be a positive pull request number.");
        }
        const brief = await readPullRequest({ principal, owner, repo, number, fetchImpl });
        return {
          ok: true,
          status: "read",
          // The rendered brief carries the platform's own reading rules — that
          // zero checks is not a pass, that a green tick is not a read log — so
          // the model is handed the caveats with the facts rather than after.
          brief: renderPullRequestBrief(brief),
          pullRequest: brief,
        };
      }

      case "list_pull_requests": {
        const owner = requireText(args?.owner, "owner");
        const repo = requireText(args?.repo, "repo");
        const pullRequests = await listPullRequests({
          principal,
          owner,
          repo,
          state: normalizeState(args?.state),
          fetchImpl,
        });
        return { ok: true, status: "read", count: pullRequests.length, pullRequests };
      }

      case "read_repo_file": {
        const owner = requireText(args?.owner, "owner");
        const repo = requireText(args?.repo, "repo");
        const path = requireText(args?.path, "path");
        const file = await readRepositoryFile({
          principal,
          owner,
          repo,
          path,
          ref: typeof args?.ref === "string" ? args.ref : undefined,
          maxBytes: Number(args?.maxBytes) || undefined,
          fetchImpl,
        });
        return {
          ok: true,
          status: "read",
          file,
          /*
           * Said in the payload, not only in the description. A truncated file
           * that reads as complete is how "there is no auth check in this file"
           * gets stated about a file whose auth check sits past the cut.
           */
          note: file.truncated
            ? `Only the first ${file.content.length} of ${file.bytes} bytes of ${file.path} are here. Say so before drawing any conclusion about the rest.`
            : undefined,
        };
      }

      case "list_issues": {
        const owner = requireText(args?.owner, "owner");
        const repo = requireText(args?.repo, "repo");
        const issues = await listIssues({ principal, owner, repo, fetchImpl });
        return { ok: true, status: "read", count: issues.length, issues };
      }

      default:
        return toolFailure(name, new Error(`${name} is not a GitHub tool Quantora serves.`));
    }
  } catch (error) {
    return toolFailure(name, error);
  }
}
