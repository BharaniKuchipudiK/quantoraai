/**
 * Every GitHub mutation Quantora performs, and the one seam that authorizes it.
 *
 * THE RULE THIS FILE EXISTS TO MAKE UNBREAKABLE
 *
 * No write reaches GitHub until GitHub itself has confirmed, for THIS user and
 * THIS repository, on THIS request, that the user may perform it. That is the
 * permanent replacement for the shared-token containment described in
 * `api/_lib/github-pr.ts`: not a flag that re-enables the old path, but a
 * different path where the credential belongs to the person taking the action.
 *
 * Structurally:
 *   - `authorizeWrite()` is the only way to obtain the token used below;
 *   - it calls `assertRepositoryPermission`, which throws on refusal;
 *   - `scripts/github-write-seam-gate.mjs` fails the build if any exported
 *     write in this repo reaches api.github.com without passing through it.
 *
 * The gate matters because the failure mode is silent. A new write helper that
 * simply forgot to authorize would work perfectly for its author — who has
 * push access — and become a confused deputy for everybody else.
 */

import {
  assertRepositoryPermission,
  githubRequest,
  type FetchLike,
  type GithubPermissionNeed,
  type GithubPrincipal,
  type RepositoryPermission,
} from "./github-principal.js";
import { normalizePullRequestSummary, type PullRequestSummary } from "./github-intelligence.js";

export type GithubWriteContext = {
  principal: GithubPrincipal;
  owner: string;
  repo: string;
  fetchImpl?: FetchLike;
};

/**
 * The authorization choke point. Returns the permission GitHub reported so
 * callers can put it in their response — a user is entitled to know which
 * access was exercised on their behalf.
 */
export async function authorizeWrite(
  context: GithubWriteContext,
  need: GithubPermissionNeed = "write",
): Promise<RepositoryPermission> {
  return assertRepositoryPermission({
    principal: context.principal,
    owner: context.owner,
    repo: context.repo,
    need,
    fetchImpl: context.fetchImpl,
  });
}

function fail(result: { status: number; data: any }, fallback: string): never {
  const message = typeof result.data?.message === "string" ? result.data.message : fallback;
  const errors = Array.isArray(result.data?.errors)
    ? result.data.errors.map((entry: any) => entry?.message).filter(Boolean).join("; ")
    : "";
  throw new Error(errors ? `${message} (${errors})` : `${message} (HTTP ${result.status})`);
}

export type CreatePullRequestRequest = {
  title: string;
  head: string;
  base?: string;
  body?: string;
  draft?: boolean;
};

export async function createPullRequest(
  context: GithubWriteContext,
  request: CreatePullRequestRequest,
): Promise<{ pullRequest: PullRequestSummary; permission: RepositoryPermission }> {
  const permission = await authorizeWrite(context, "write");

  const title = String(request.title || "").trim().slice(0, 240);
  const head = String(request.head || "").trim().slice(0, 200);
  const base = String(request.base || permission.defaultBranch || "main").trim().slice(0, 200);
  if (!title) throw new Error("A pull request needs a title.");
  if (!head) throw new Error("A pull request needs a head branch that already exists on GitHub.");
  if (head === base) throw new Error(`The head branch and base branch are both "${base}". GitHub cannot open a pull request from a branch to itself.`);

  const result = await githubRequest(
    `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/pulls`,
    {
      token: context.principal.token,
      method: "POST",
      fetchImpl: context.fetchImpl,
      body: {
        title,
        head,
        base,
        body: String(request.body || "").slice(0, 60_000) || "Opened from Quantora.",
        draft: request.draft !== false,
      },
    },
  );

  if (result.status === 422) {
    // The single most common cause, and the one Quantora is responsible for
    // being clear about: the desk commits locally and never pushes.
    fail(result, `GitHub rejected this pull request. Confirm the head branch "${head}" exists on GitHub — Quantora's coding desk commits locally and does not push branches.`);
  }
  if (!result.ok) fail(result, "GitHub could not create the pull request.");

  return { pullRequest: normalizePullRequestSummary(result.data), permission };
}

export async function commentOnPullRequest(
  context: GithubWriteContext,
  request: { number: number; body: string },
): Promise<{ url: string; permission: RepositoryPermission }> {
  const permission = await authorizeWrite(context, "write");

  const number = Number(request.number);
  const body = String(request.body || "").trim();
  if (!Number.isInteger(number) || number <= 0) throw new Error("A pull request or issue number is required.");
  if (!body) throw new Error("A comment needs text.");

  const result = await githubRequest(
    `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/issues/${number}/comments`,
    {
      token: context.principal.token,
      method: "POST",
      fetchImpl: context.fetchImpl,
      body: { body: body.slice(0, 60_000) },
    },
  );

  if (!result.ok) fail(result, `GitHub could not post the comment on #${number}.`);
  return { url: String(result.data?.html_url || ""), permission };
}

/**
 * Merge, bound to the exact commit the human approved.
 *
 * `expectedHeadSha` is not decoration. Between reading a PR and pressing merge,
 * someone can push to the head branch — so the thing merged would not be the
 * thing reviewed. GitHub accepts `sha` on the merge call and refuses if the
 * head has moved; Quantora requires the caller to supply it, checks it once
 * itself for a clear error message, and passes it through so GitHub enforces it
 * too. A merge with no named commit is not an approved merge, so there is no
 * code path that omits it.
 */
export async function mergePullRequest(
  context: GithubWriteContext,
  request: { number: number; expectedHeadSha: string; mergeMethod?: "merge" | "squash" | "rebase" },
): Promise<{ merged: boolean; sha: string; message: string; permission: RepositoryPermission }> {
  const permission = await authorizeWrite(context, "write");

  const number = Number(request.number);
  const expectedHeadSha = String(request.expectedHeadSha || "").trim();
  if (!Number.isInteger(number) || number <= 0) throw new Error("A pull request number is required to merge.");
  if (!/^[0-9a-f]{7,40}$/i.test(expectedHeadSha)) {
    throw new Error("Merging requires the exact head commit you reviewed. Re-open the pull request in Quantora so the current commit is loaded, then merge.");
  }

  const detail = await githubRequest(
    `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/pulls/${number}`,
    { token: context.principal.token, fetchImpl: context.fetchImpl },
  );
  if (!detail.ok) fail(detail, `GitHub could not read pull request #${number} before merging.`);

  const current = normalizePullRequestSummary(detail.data);
  if (!current.headSha.toLowerCase().startsWith(expectedHeadSha.toLowerCase())) {
    throw new Error(`Pull request #${number} has moved since you reviewed it (now ${current.headSha.slice(0, 12)}, you approved ${expectedHeadSha.slice(0, 12)}). Nothing was merged. Re-read it and approve the new commit.`);
  }
  if (current.state !== "open") {
    throw new Error(`Pull request #${number} is ${current.state}. Nothing was merged.`);
  }

  const method = request.mergeMethod === "merge" || request.mergeMethod === "rebase" ? request.mergeMethod : "squash";
  const result = await githubRequest(
    `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/pulls/${number}/merge`,
    {
      token: context.principal.token,
      method: "PUT",
      fetchImpl: context.fetchImpl,
      body: { merge_method: method, sha: current.headSha },
    },
  );

  if (result.status === 405 || result.status === 409) {
    // Branch protection, a required review, a failing required check, or a race
    // on the head. All of them mean GitHub said no — which is the system
    // working, and must be reported as a refusal rather than an outage.
    fail(result, `GitHub refused to merge #${number}. Branch protection, a required review, or a required check is blocking it.`);
  }
  if (!result.ok) fail(result, `GitHub could not merge pull request #${number}.`);

  return {
    merged: result.data?.merged === true,
    sha: String(result.data?.sha || ""),
    message: String(result.data?.message || "Pull request merged."),
    permission,
  };
}
