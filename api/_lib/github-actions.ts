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
  assertRepositoryCreationAllowed,
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
    // Almost always a head branch that is not on GitHub yet. That used to be
    // unfixable from here and the message said so; now "Save to GitHub" can
    // create it, so the message names the way out instead of the limitation.
    fail(result, `GitHub rejected this pull request. Confirm the head branch "${head}" exists on GitHub — if these are desk files that were never pushed, use Save to GitHub to push them to "${head}" first.`);
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

/* ------------------------------------------------------------------ *
 * Putting files into a repository
 * ------------------------------------------------------------------ */

/**
 * Quantora builds files. Until now they could never leave.
 *
 * The desk's git — in the browser and on the desktop alike — deliberately does
 * nothing that leaves the machine, so a generated project stayed a generated
 * project. These operations are the seam where a build becomes something the
 * user owns: a repository under their account, with their commit, made on their
 * own credential and under their own GitHub permissions.
 *
 * Both follow the same authorization discipline as every other write in this
 * file, with one difference worth stating plainly: creating a repository has no
 * repository to ask permission about, so it asks the question that does apply —
 * may this principal create one here — before anything is written. See
 * `assertRepositoryCreationAllowed`.
 */

/** Bounds chosen so one push fits comfortably inside a serverless invocation. */
export const PUSH_MAX_FILES = 400;
export const PUSH_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const PUSH_MAX_FILE_BYTES = 1024 * 1024;

export type PushFile = { path: string; content: string };

export type PushFilesRequest = {
  files: PushFile[];
  message: string;
  branch?: string;
};

export type PushFilesResult = {
  commitSha: string;
  branch: string;
  fileCount: number;
  createdBranch: boolean;
  htmlUrl: string;
  permission: RepositoryPermission;
};

/**
 * A repository path GitHub will accept and a reader will recognise.
 *
 * `..` is rejected rather than normalized away. Git would store `a/../b`
 * literally, so quietly rewriting it would put the file somewhere the user did
 * not ask for; refusing is the only honest option at this layer.
 */
export function normalizeRepositoryPath(input: unknown): string {
  const raw = String(input ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!raw) throw new Error("Every file needs a path inside the repository.");
  if (raw.length > 400) throw new Error(`This path is too long for a repository: ${raw.slice(0, 60)}…`);
  if (raw.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error(`"${raw}" points outside the repository. Paths must stay inside it.`);
  }
  if (raw === ".git" || raw.startsWith(".git/")) {
    throw new Error("Quantora will not write into .git — that is git's own storage, not your project.");
  }
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error("A file path contains control characters.");
  return raw;
}

export function normalizePushFiles(input: unknown): PushFile[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("There are no files to push. Build something on the desk first.");
  }
  if (input.length > PUSH_MAX_FILES) {
    throw new Error(`This push has ${input.length} files; Quantora sends at most ${PUSH_MAX_FILES} at a time.`);
  }

  const seen = new Set<string>();
  let total = 0;
  const files: PushFile[] = [];

  for (const entry of input) {
    const path = normalizeRepositoryPath((entry as any)?.path);
    const content = typeof (entry as any)?.content === "string" ? (entry as any).content : "";
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > PUSH_MAX_FILE_BYTES) {
      throw new Error(`"${path}" is ${Math.round(bytes / 1024)}KB; single files are limited to ${PUSH_MAX_FILE_BYTES / 1024}KB.`);
    }
    total += bytes;
    if (total > PUSH_MAX_TOTAL_BYTES) {
      throw new Error(`This push is larger than ${PUSH_MAX_TOTAL_BYTES / (1024 * 1024)}MB in total. Push fewer files at once.`);
    }
    // A duplicate path would silently win or lose depending on tree ordering.
    if (seen.has(path)) throw new Error(`"${path}" appears twice in this push.`);
    seen.add(path);
    files.push({ path, content });
  }

  return files;
}

/** Git refuses some branch names outright; catching them here beats a 422. */
export function normalizeBranchName(input: unknown, fallback: string): string {
  const raw = String(input ?? "").trim().replace(/^refs\/heads\//, "");
  const branch = raw || fallback;
  if (!branch) throw new Error("A branch name is required.");
  if (branch.length > 200) throw new Error("That branch name is too long.");
  if (/^-|\.\.|[\u0000-\u001f\u007f ~^:?*[\\]|\/$|\.$|\.lock$|^\/|\/\//.test(branch)) {
    throw new Error(`"${branch}" is not a branch name git will accept.`);
  }
  return branch;
}

/**
 * Write files into a repository as one commit, on the user's own credential.
 *
 * Uses the git data API rather than the contents API: the contents API writes
 * one file per commit, so a twelve-file project would land as twelve commits
 * and twelve chances to half-succeed. Here the blobs and the tree are staged
 * first and the branch moves exactly once, at the end — so a failure partway
 * through leaves unreferenced objects GitHub garbage-collects, and the branch
 * is either where it was or where the whole push put it.
 */
export async function pushFilesToRepository(
  context: GithubWriteContext,
  request: PushFilesRequest,
): Promise<PushFilesResult> {
  const permission = await authorizeWrite(context, "write");

  const files = normalizePushFiles(request?.files);
  const message = String(request?.message || "").trim().slice(0, 2_000);
  if (!message) throw new Error("A commit needs a real message describing what changed.");
  const branch = normalizeBranchName(request?.branch, permission.defaultBranch || "main");

  const owner = encodeURIComponent(context.owner);
  const repo = encodeURIComponent(context.repo);
  const token = context.principal.token;
  const fetchImpl = context.fetchImpl;

  // A repository created moments ago has no commits and therefore no ref. That
  // is the ordinary first-push case here, not an error, so this branches on a
  // real signal — does the ref exist — rather than on a guess.
  const existingRef = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
    token,
    fetchImpl,
  });
  const parentSha = existingRef.ok ? String(existingRef.data?.object?.sha || "") : "";
  const createdBranch = !parentSha;

  let baseTreeSha = "";
  if (parentSha) {
    const parentCommit = await githubRequest(`/repos/${owner}/${repo}/git/commits/${encodeURIComponent(parentSha)}`, {
      token,
      fetchImpl,
    });
    if (!parentCommit.ok) fail(parentCommit, `GitHub could not read the current commit on "${branch}". Nothing was pushed.`);
    baseTreeSha = String(parentCommit.data?.tree?.sha || "");
  }

  const blobs: Array<{ path: string; sha: string }> = [];
  for (const file of files) {
    const blob = await githubRequest(`/repos/${owner}/${repo}/git/blobs`, {
      token,
      method: "POST",
      fetchImpl,
      body: { content: Buffer.from(file.content, "utf8").toString("base64"), encoding: "base64" },
    });
    if (!blob.ok) fail(blob, `GitHub rejected the contents of "${file.path}". Nothing was pushed.`);
    blobs.push({ path: file.path, sha: String(blob.data?.sha || "") });
  }

  const tree = await githubRequest(`/repos/${owner}/${repo}/git/trees`, {
    token,
    method: "POST",
    fetchImpl,
    body: {
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
      tree: blobs.map((blob) => ({ path: blob.path, mode: "100644", type: "blob", sha: blob.sha })),
    },
  });
  if (!tree.ok) fail(tree, "GitHub could not assemble these files into a commit. Nothing was pushed.");

  const commit = await githubRequest(`/repos/${owner}/${repo}/git/commits`, {
    token,
    method: "POST",
    fetchImpl,
    body: {
      message,
      tree: String(tree.data?.sha || ""),
      ...(parentSha ? { parents: [parentSha] } : {}),
    },
  });
  if (!commit.ok) fail(commit, "GitHub could not create the commit. Nothing was pushed.");
  const commitSha = String(commit.data?.sha || "");

  const ref = createdBranch
    ? await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
        token,
        method: "POST",
        fetchImpl,
        body: { ref: `refs/heads/${branch}`, sha: commitSha },
      })
    : await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
        token,
        method: "PATCH",
        fetchImpl,
        // force stays false: a fast-forward failure means somebody else pushed,
        // and overwriting their commit is never the safe default.
        body: { sha: commitSha, force: false },
      });

  if (!ref.ok && !createdBranch && (ref.status === 422 || ref.status === 409)) {
    // Thrown rather than passed to fail(): GitHub's own wording here is "Update
    // is not a fast forward", which is accurate and tells the user nothing
    // about what nearly happened to their colleague's work. fail() prefers
    // GitHub's message over a fallback, so the consequence has to lead.
    throw new Error(
      `"${branch}" has moved on GitHub since Quantora read it, so this push would have discarded someone else's commit. Nothing was changed. Pull the branch and push again. (GitHub said: ${String(ref.data?.message || `HTTP ${ref.status}`)})`,
    );
  }
  if (!ref.ok) fail(ref, `GitHub could not move "${branch}" to the new commit.`);

  return {
    commitSha,
    branch,
    fileCount: files.length,
    createdBranch,
    htmlUrl: `https://github.com/${context.owner}/${context.repo}/tree/${branch}`,
    permission,
  };
}

export type CreateRepositoryRequest = {
  owner: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
};

export type CreateRepositoryResult = {
  owner: string;
  repo: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
};

/** GitHub's own rule: letters, digits, dot, dash, underscore. */
export function normalizeRepositoryName(input: unknown): string {
  const raw = String(input ?? "").trim().replace(/\.git$/i, "");
  if (!raw) throw new Error("A repository needs a name.");
  if (raw.length > 100) throw new Error("A repository name may be at most 100 characters.");
  if (!/^[A-Za-z0-9_.-]+$/.test(raw)) {
    throw new Error(`"${raw}" is not a repository name GitHub accepts. Use letters, numbers, dots, hyphens and underscores.`);
  }
  if (raw === "." || raw === "..") throw new Error("That is not a usable repository name.");
  return raw;
}

/**
 * Create a repository the user owns.
 *
 * PRIVATE BY DEFAULT, deliberately. Everything Quantora builds is created from
 * something the user typed, and may carry keys, customer names, or a business
 * idea they have not announced. A public repository cannot be un-published —
 * the moment it exists it can be cloned, cached and indexed — so the reversible
 * default is the only defensible one. `isPrivate: false` is honoured, but it
 * has to be asked for.
 */
export async function createRepository(
  context: { principal: GithubPrincipal; fetchImpl?: FetchLike },
  request: CreateRepositoryRequest,
): Promise<CreateRepositoryResult> {
  const target = await assertRepositoryCreationAllowed({
    principal: context.principal,
    owner: request?.owner,
    fetchImpl: context.fetchImpl,
  });

  const name = normalizeRepositoryName(request?.name);
  const description = String(request?.description || "").trim().slice(0, 350);
  const isPrivate = request?.isPrivate !== false;

  const result = await githubRequest(
    target.isOrganization ? `/orgs/${encodeURIComponent(target.owner)}/repos` : "/user/repos",
    {
      token: context.principal.token,
      method: "POST",
      fetchImpl: context.fetchImpl,
      body: {
        name,
        private: isPrivate,
        description: description || "Created with Quantora.",
        auto_init: false,
      },
    },
  );

  if (result.status === 422) {
    fail(result, `GitHub would not create "${target.owner}/${name}". A repository with that name probably already exists.`);
  }
  if (!result.ok) fail(result, `GitHub could not create "${target.owner}/${name}".`);

  return {
    owner: String(result.data?.owner?.login || target.owner),
    repo: String(result.data?.name || name),
    fullName: String(result.data?.full_name || `${target.owner}/${name}`),
    htmlUrl: String(result.data?.html_url || ""),
    // A repository created with auto_init:false has no commits yet, so this is
    // the branch the first push should create, not one that exists.
    defaultBranch: String(result.data?.default_branch || "main"),
    isPrivate: result.data?.private !== false,
  };
}
