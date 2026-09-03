/**
 * Reading a pull request the way a reviewer actually reads one.
 *
 * A PR is not its title. What decides whether it is safe to merge is the diff,
 * what CI says on the CURRENT head, and which review threads are still open.
 * Quantora previously had none of that: Import Repository loaded default-branch
 * files and the desk knew nothing about the work in flight.
 *
 * WHAT THIS MODULE REFUSES TO DO (CLAUDE.md §1)
 *
 * A green check is a claim; the log is the evidence. So:
 *   - a PR with zero checks reports "none", never "passing". Absence of a
 *     failure is not a pass, and the one shape that would let an unverified PR
 *     read as verified is a default of green, so there isn't one;
 *   - every failing check keeps its own URL, because the actionable thing is
 *     the log, not the word "failure";
 *   - checks are summarized for the HEAD SHA the summary names, and the SHA
 *     travels with the summary, so a stale answer is visibly stale.
 *
 * Every network function takes an injected fetch so the normalizers above can
 * be tested against real payload shapes without a network.
 */

import { githubRequest, type FetchLike, type GithubPrincipal } from "./github-principal.js";

const MAX_FILES = 60;
const MAX_PATCH_CHARS = 6_000;
const MAX_BRIEF_CHARS = 90_000;

export type CheckState = "passing" | "failing" | "pending" | "none";

export type CheckSummary = {
  state: CheckState;
  headSha: string;
  total: number;
  failing: Array<{ name: string; conclusion: string; url: string }>;
  pending: string[];
};

export type PullRequestSummary = {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  author: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  htmlUrl: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean | null;
  /** GitHub's own word: "clean", "dirty", "blocked", "behind", … */
  mergeStateStatus: string;
};

export type ReviewThread = {
  id: number;
  path: string;
  line: number | null;
  author: string;
  body: string;
  resolved: boolean;
  url: string;
};

export type PullRequestBrief = {
  repository: string;
  summary: PullRequestSummary;
  checks: CheckSummary;
  files: Array<{ path: string; status: string; additions: number; deletions: number; patch: string }>;
  reviews: Array<{ author: string; state: string; body: string; submittedAt: string }>;
  threads: ReviewThread[];
  comments: Array<{ author: string; body: string; createdAt: string }>;
  truncated: { files: boolean };
};

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePullRequestSummary(payload: any): PullRequestSummary {
  const merged = payload?.merged === true || Boolean(payload?.merged_at);
  const rawState = text(payload?.state, 20).toLowerCase();
  return {
    number: count(payload?.number),
    title: text(payload?.title, 300),
    state: merged ? "merged" : rawState === "closed" ? "closed" : "open",
    draft: payload?.draft === true,
    author: text(payload?.user?.login, 120),
    headRef: text(payload?.head?.ref, 200),
    baseRef: text(payload?.base?.ref, 200),
    headSha: text(payload?.head?.sha, 80),
    htmlUrl: text(payload?.html_url, 400),
    updatedAt: text(payload?.updated_at, 40),
    additions: count(payload?.additions),
    deletions: count(payload?.deletions),
    changedFiles: count(payload?.changed_files),
    // `mergeable` is null while GitHub computes it. Null is not false, and
    // reporting it as false would invent a conflict that may not exist.
    mergeable: typeof payload?.mergeable === "boolean" ? payload.mergeable : null,
    mergeStateStatus: text(payload?.mergeable_state, 40),
  };
}

/**
 * Fold check runs and legacy commit statuses into one honest verdict.
 *
 * The precedence is failure > pending > success, and zero checks is "none".
 * A `skipped` or `neutral` conclusion is not a failure and not a pass — it is
 * counted, and it cannot make an otherwise empty PR look verified.
 */
export function summarizeChecks(input: {
  headSha: string;
  checkRuns?: any[];
  statuses?: any[];
}): CheckSummary {
  const failing: CheckSummary["failing"] = [];
  const pending: string[] = [];
  let total = 0;
  let successes = 0;

  for (const run of Array.isArray(input.checkRuns) ? input.checkRuns : []) {
    total += 1;
    const name = text(run?.name, 200) || "(unnamed check)";
    const status = text(run?.status, 40).toLowerCase();
    const conclusion = text(run?.conclusion, 40).toLowerCase();
    if (status !== "completed") {
      pending.push(name);
      continue;
    }
    if (["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"].includes(conclusion)) {
      failing.push({ name, conclusion: conclusion || "failure", url: text(run?.html_url || run?.details_url, 400) });
      continue;
    }
    if (conclusion === "success") successes += 1;
  }

  for (const status of Array.isArray(input.statuses) ? input.statuses : []) {
    total += 1;
    const name = text(status?.context, 200) || "(unnamed status)";
    const state = text(status?.state, 40).toLowerCase();
    if (state === "pending") {
      pending.push(name);
      continue;
    }
    if (state === "failure" || state === "error") {
      failing.push({ name, conclusion: state, url: text(status?.target_url, 400) });
      continue;
    }
    if (state === "success") successes += 1;
  }

  const state: CheckState = total === 0
    ? "none"
    : failing.length > 0
      ? "failing"
      : pending.length > 0
        ? "pending"
        // Every check completed and none failed, but if not one of them actually
        // succeeded (all skipped/neutral) this is not a verified PR.
        : successes > 0
          ? "passing"
          : "none";

  return { state, headSha: text(input.headSha, 80), total, failing, pending };
}

export function normalizeReviewThreads(comments: any[]): ReviewThread[] {
  return (Array.isArray(comments) ? comments : []).map((comment) => ({
    id: count(comment?.id),
    path: text(comment?.path, 400),
    // Number(null) is 0 and Number.isFinite(0) is true, so a comment with no
    // line anchored itself to "line 0" — a line that exists in no file. A
    // file-level comment has no line, and must say so.
    line: typeof comment?.line === "number" && Number.isFinite(comment.line) && comment.line > 0
      ? comment.line
      : null,
    author: text(comment?.user?.login, 120),
    body: text(comment?.body, 4_000),
    // The REST review-comments endpoint has no resolved flag; GraphQL does.
    // Reporting `false` would assert "unresolved" on evidence we do not have,
    // so an absent flag stays absent rather than becoming a claim.
    resolved: comment?.resolved === true,
    url: text(comment?.html_url, 400),
  }));
}

export function normalizeChangedFiles(files: any[]): { files: PullRequestBrief["files"]; truncated: boolean } {
  const all = Array.isArray(files) ? files : [];
  return {
    files: all.slice(0, MAX_FILES).map((file) => ({
      path: text(file?.filename, 400),
      status: text(file?.status, 40),
      additions: count(file?.additions),
      deletions: count(file?.deletions),
      patch: text(file?.patch, MAX_PATCH_CHARS),
    })),
    truncated: all.length > MAX_FILES,
  };
}

/**
 * Render a brief for a model or a human. Kept in one place so the chat surface
 * and the desk panel cannot disagree about what a PR says.
 */
export function renderPullRequestBrief(brief: PullRequestBrief): string {
  const { summary, checks } = brief;
  const lines: string[] = [];
  lines.push(`[QUANTORA PULL REQUEST BRIEF — READ ONLY]`);
  lines.push(`Repository: ${brief.repository}`);
  lines.push(`PR #${summary.number}: ${summary.title}`);
  lines.push(`Author: ${summary.author || "unknown"} | State: ${summary.state}${summary.draft ? " (draft)" : ""}`);
  lines.push(`Branch: ${summary.headRef} → ${summary.baseRef} @ ${summary.headSha.slice(0, 12) || "unknown"}`);
  lines.push(`Diff: +${summary.additions} −${summary.deletions} across ${summary.changedFiles} file(s)`);
  lines.push(
    summary.mergeable === null
      ? `Mergeable: GitHub has not finished computing this yet.`
      : `Mergeable: ${summary.mergeable ? "yes" : "no — the branch conflicts with its base"} (${summary.mergeStateStatus || "unknown"})`,
  );

  if (checks.state === "none") {
    lines.push(`Checks: NONE ran on ${checks.headSha.slice(0, 12) || "this head"}. No CI evidence exists for this commit — that is not a pass.`);
  } else if (checks.state === "failing") {
    lines.push(`Checks: FAILING (${checks.failing.length} of ${checks.total}) on ${checks.headSha.slice(0, 12)}:`);
    for (const failure of checks.failing) {
      lines.push(`  - ${failure.name} (${failure.conclusion}) ${failure.url || "(no log URL)"}`);
    }
  } else if (checks.state === "pending") {
    lines.push(`Checks: still running (${checks.pending.length} of ${checks.total} pending) on ${checks.headSha.slice(0, 12)}.`);
  } else {
    lines.push(`Checks: ${checks.total} completed, none failing, on ${checks.headSha.slice(0, 12)}. Open the logs before treating this as proof.`);
  }

  if (brief.threads.length) {
    lines.push(`\nOPEN REVIEW COMMENTS (${brief.threads.length})`);
    for (const thread of brief.threads.slice(0, 40)) {
      lines.push(`  - ${thread.author} on ${thread.path}${thread.line ? `:${thread.line}` : ""}: ${thread.body.slice(0, 400)}`);
    }
  }

  if (brief.reviews.length) {
    lines.push(`\nREVIEWS`);
    for (const review of brief.reviews.slice(0, 20)) {
      lines.push(`  - ${review.author}: ${review.state}${review.body ? ` — ${review.body.slice(0, 300)}` : ""}`);
    }
  }

  lines.push(`\nCHANGED FILES${brief.truncated.files ? ` (first ${brief.files.length}; more were not loaded)` : ""}`);
  for (const file of brief.files) {
    lines.push(`\n--- ${file.path} (${file.status}, +${file.additions} −${file.deletions}) ---`);
    if (file.patch) lines.push(file.patch);
    else lines.push("(no textual patch — binary, renamed, or too large)");
  }

  lines.push(`\nThis brief is read-only GitHub context. Do not claim a change was pushed, a comment posted, or a check re-run unless a Quantora action reported doing it.`);
  return lines.join("\n").slice(0, MAX_BRIEF_CHARS);
}

/* ------------------------------------------------------------------ *
 * Network reads — every one acts as the connected user
 * ------------------------------------------------------------------ */

export async function listPullRequests(input: {
  principal: GithubPrincipal;
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  limit?: number;
  fetchImpl?: FetchLike;
}): Promise<PullRequestSummary[]> {
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
  const state = input.state === "closed" || input.state === "all" ? input.state : "open";
  const result = await githubRequest(
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls?state=${state}&per_page=${limit}&sort=updated&direction=desc`,
    { token: input.principal.token, fetchImpl: input.fetchImpl },
  );
  if (!result.ok) {
    throw new Error(`GitHub could not list pull requests for ${input.owner}/${input.repo} (HTTP ${result.status}).`);
  }
  return (Array.isArray(result.data) ? result.data : []).map(normalizePullRequestSummary);
}

export async function listIssues(input: {
  principal: GithubPrincipal;
  owner: string;
  repo: string;
  limit?: number;
  fetchImpl?: FetchLike;
}): Promise<Array<{ number: number; title: string; author: string; state: string; labels: string[]; htmlUrl: string; updatedAt: string }>> {
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
  const result = await githubRequest(
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues?state=open&per_page=${limit}&sort=updated&direction=desc`,
    { token: input.principal.token, fetchImpl: input.fetchImpl },
  );
  if (!result.ok) {
    throw new Error(`GitHub could not list issues for ${input.owner}/${input.repo} (HTTP ${result.status}).`);
  }
  return (Array.isArray(result.data) ? result.data : [])
    // GitHub's issues endpoint returns pull requests too. A PR listed as an
    // issue is how a "3 open issues" count silently becomes wrong.
    .filter((issue: any) => !issue?.pull_request)
    .map((issue: any) => ({
      number: count(issue?.number),
      title: text(issue?.title, 300),
      author: text(issue?.user?.login, 120),
      state: text(issue?.state, 20),
      labels: (Array.isArray(issue?.labels) ? issue.labels : []).map((label: any) => text(label?.name || label, 80)).filter(Boolean),
      htmlUrl: text(issue?.html_url, 400),
      updatedAt: text(issue?.updated_at, 40),
    }));
}

export async function readPullRequest(input: {
  principal: GithubPrincipal;
  owner: string;
  repo: string;
  number: number;
  fetchImpl?: FetchLike;
}): Promise<PullRequestBrief> {
  const { principal, owner, repo, number, fetchImpl } = input;
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`;

  const detail = await githubRequest(base, { token: principal.token, fetchImpl });
  if (detail.status === 404) throw new Error(`Pull request #${number} was not found in ${owner}/${repo}.`);
  if (!detail.ok) throw new Error(`GitHub could not read pull request #${number} (HTTP ${detail.status}).`);

  const summary = normalizePullRequestSummary(detail.data);

  const [filesResult, reviewsResult, commentsResult, issueCommentsResult] = await Promise.all([
    githubRequest(`${base}/files?per_page=100`, { token: principal.token, fetchImpl }),
    githubRequest(`${base}/reviews?per_page=50`, { token: principal.token, fetchImpl }),
    githubRequest(`${base}/comments?per_page=100`, { token: principal.token, fetchImpl }),
    githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments?per_page=50`, { token: principal.token, fetchImpl }),
  ]);

  const checks = summary.headSha
    ? await readChecks({ principal, owner, repo, sha: summary.headSha, fetchImpl })
    : summarizeChecks({ headSha: "" });

  const changed = normalizeChangedFiles(filesResult.ok ? filesResult.data : []);

  return {
    repository: `${owner}/${repo}`,
    summary,
    checks,
    files: changed.files,
    truncated: { files: changed.truncated },
    reviews: (Array.isArray(reviewsResult.data) ? reviewsResult.data : []).map((review: any) => ({
      author: text(review?.user?.login, 120),
      state: text(review?.state, 40),
      body: text(review?.body, 2_000),
      submittedAt: text(review?.submitted_at, 40),
    })),
    threads: normalizeReviewThreads(commentsResult.ok ? commentsResult.data : []),
    comments: (Array.isArray(issueCommentsResult.data) ? issueCommentsResult.data : []).map((comment: any) => ({
      author: text(comment?.user?.login, 120),
      body: text(comment?.body, 2_000),
      createdAt: text(comment?.created_at, 40),
    })),
  };
}

export async function readChecks(input: {
  principal: GithubPrincipal;
  owner: string;
  repo: string;
  sha: string;
  fetchImpl?: FetchLike;
}): Promise<CheckSummary> {
  const { principal, owner, repo, sha, fetchImpl } = input;
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`;
  const [runs, statuses] = await Promise.all([
    githubRequest(`${prefix}/check-runs?per_page=100`, { token: principal.token, fetchImpl }),
    githubRequest(`${prefix}/status`, { token: principal.token, fetchImpl }),
  ]);
  return summarizeChecks({
    headSha: sha,
    checkRuns: runs.ok ? runs.data?.check_runs : [],
    statuses: statuses.ok ? statuses.data?.statuses : [],
  });
}
