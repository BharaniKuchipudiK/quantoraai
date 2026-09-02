import assert from "node:assert/strict";
import test from "node:test";
import {
  listIssues,
  normalizeChangedFiles,
  normalizePullRequestSummary,
  normalizeReviewThreads,
  readPullRequest,
  renderPullRequestBrief,
  summarizeChecks,
} from "./github-intelligence.js";

const principal = { userSub: "u", login: "octo", token: "gho_x", scopes: [], connectedAt: "" };

function routedFetch(routes: Record<string, unknown>) {
  const seen: string[] = [];
  const impl = async (url: string) => {
    seen.push(url);
    const key = Object.keys(routes).find((route) => url.includes(route));
    const body = key ? routes[key] : null;
    return {
      ok: key !== undefined,
      status: key !== undefined ? 200 : 404,
      text: async () => JSON.stringify(body ?? { message: "Not Found" }),
    };
  };
  return { impl, seen };
}

test("zero checks reports none, never passing", () => {
  const summary = summarizeChecks({ headSha: "abc123def456" });
  assert.equal(summary.state, "none");
  assert.equal(summary.total, 0);
  // The whole point: absence of a failure is not evidence of a pass.
  assert.notEqual(summary.state, "passing");
});

test("a failing check outranks pending and success, and keeps its log URL", () => {
  const summary = summarizeChecks({
    headSha: "abc123",
    checkRuns: [
      { name: "unit", status: "completed", conclusion: "success" },
      { name: "lint", status: "in_progress" },
      { name: "e2e", status: "completed", conclusion: "failure", html_url: "https://github.com/acme/widget/runs/9" },
    ],
  });
  assert.equal(summary.state, "failing");
  assert.equal(summary.failing.length, 1);
  assert.equal(summary.failing[0].name, "e2e");
  assert.equal(summary.failing[0].url, "https://github.com/acme/widget/runs/9");
  assert.deepEqual(summary.pending, ["lint"]);
  assert.equal(summary.total, 3);
});

test("checks that all skipped are not a pass", () => {
  const summary = summarizeChecks({
    headSha: "abc123",
    checkRuns: [
      { name: "unit", status: "completed", conclusion: "skipped" },
      { name: "lint", status: "completed", conclusion: "neutral" },
    ],
  });
  // Two checks ran and neither actually verified anything. Reporting "passing"
  // here is exactly the green-check-as-a-claim failure CLAUDE.md §1 names.
  assert.equal(summary.state, "none");
  assert.equal(summary.total, 2);
});

test("legacy commit statuses fold into the same verdict", () => {
  assert.equal(summarizeChecks({ headSha: "a", statuses: [{ context: "ci/legacy", state: "success" }] }).state, "passing");
  assert.equal(summarizeChecks({ headSha: "a", statuses: [{ context: "ci/legacy", state: "error" }] }).state, "failing");
  assert.equal(summarizeChecks({ headSha: "a", statuses: [{ context: "ci/legacy", state: "pending" }] }).state, "pending");
});

test("timed out and cancelled runs count as failures", () => {
  for (const conclusion of ["timed_out", "cancelled", "action_required", "startup_failure", "stale"]) {
    const summary = summarizeChecks({ headSha: "a", checkRuns: [{ name: "x", status: "completed", conclusion }] });
    assert.equal(summary.state, "failing", `${conclusion} must not read as a pass`);
  }
});

test("a merged pull request is not just closed, and an uncomputed mergeable stays null", () => {
  const merged = normalizePullRequestSummary({ number: 7, state: "closed", merged_at: "2026-09-01T00:00:00Z", head: { ref: "f", sha: "s" }, base: { ref: "main" } });
  assert.equal(merged.state, "merged");

  const open = normalizePullRequestSummary({ number: 8, state: "open", mergeable: null, head: { ref: "f", sha: "s" }, base: { ref: "main" } });
  assert.equal(open.state, "open");
  // null means "GitHub has not decided yet". Coercing it to false invents a
  // conflict and would tell the user to fix something that is not broken.
  assert.equal(open.mergeable, null);

  const conflicted = normalizePullRequestSummary({ number: 9, state: "open", mergeable: false, mergeable_state: "dirty", head: { ref: "f", sha: "s" }, base: { ref: "main" } });
  assert.equal(conflicted.mergeable, false);
  assert.equal(conflicted.mergeStateStatus, "dirty");
});

test("review threads carry their file and line, and an unknown resolved state is not claimed as unresolved", () => {
  const threads = normalizeReviewThreads([
    { id: 1, path: "src/a.js", line: 12, user: { login: "rev" }, body: "rename this", html_url: "https://x" },
    { id: 2, path: "src/b.js", line: null, user: { login: "rev" }, body: "?" },
  ]);
  assert.equal(threads.length, 2);
  assert.equal(threads[0].path, "src/a.js");
  assert.equal(threads[0].line, 12);
  assert.equal(threads[1].line, null);
  assert.equal(threads[0].resolved, false);
});

test("changed files are capped and the truncation is reported rather than hidden", () => {
  const many = Array.from({ length: 80 }, (_, index) => ({ filename: `f${index}.js`, status: "modified", additions: 1, deletions: 0, patch: "@@" }));
  const result = normalizeChangedFiles(many);
  assert.equal(result.files.length, 60);
  assert.equal(result.truncated, true);
  assert.equal(normalizeChangedFiles([{ filename: "a.js" }]).truncated, false);
});

test("the rendered brief states what CI evidence exists, in words the reader can act on", () => {
  const base = {
    repository: "acme/widget",
    summary: normalizePullRequestSummary({ number: 12, title: "Add gate", state: "open", user: { login: "dev" }, head: { ref: "feat", sha: "abcdef1234567890" }, base: { ref: "main" }, additions: 10, deletions: 2, changed_files: 1, mergeable: true, mergeable_state: "clean" }),
    files: [{ path: "src/a.js", status: "modified", additions: 10, deletions: 2, patch: "@@ -1 +1 @@" }],
    reviews: [],
    threads: [],
    comments: [],
    truncated: { files: false },
  };

  const noChecks = renderPullRequestBrief({ ...base, checks: summarizeChecks({ headSha: "abcdef1234567890" }) });
  assert.match(noChecks, /Checks: NONE/);
  assert.match(noChecks, /that is not a pass/);

  const failing = renderPullRequestBrief({
    ...base,
    checks: summarizeChecks({ headSha: "abcdef1234567890", checkRuns: [{ name: "e2e", status: "completed", conclusion: "failure", html_url: "https://logs" }] }),
  });
  assert.match(failing, /Checks: FAILING/);
  assert.match(failing, /https:\/\/logs/);

  // Even a clean run points at the log rather than declaring victory.
  const passing = renderPullRequestBrief({
    ...base,
    checks: summarizeChecks({ headSha: "abcdef1234567890", checkRuns: [{ name: "unit", status: "completed", conclusion: "success" }] }),
  });
  assert.match(passing, /Open the logs before treating this as proof/);
  assert.match(passing, /src\/a\.js/);
  assert.match(passing, /read-only GitHub context/);
});

test("listIssues drops pull requests, which GitHub returns from the issues endpoint", async () => {
  const { impl } = routedFetch({
    "/issues?": [
      { number: 1, title: "A real issue", user: { login: "a" }, state: "open", labels: [{ name: "bug" }] },
      { number: 2, title: "Actually a PR", user: { login: "b" }, state: "open", pull_request: { url: "x" } },
    ],
  });
  const issues = await listIssues({ principal, owner: "acme", repo: "widget", fetchImpl: impl });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].number, 1);
  assert.deepEqual(issues[0].labels, ["bug"]);
});

test("readPullRequest assembles diff, checks, reviews and threads for the head it names", async () => {
  const { impl, seen } = routedFetch({
    "/pulls/42/files": [{ filename: "src/a.js", status: "modified", additions: 3, deletions: 1, patch: "@@ diff @@" }],
    "/pulls/42/reviews": [{ user: { login: "rev" }, state: "CHANGES_REQUESTED", body: "please fix", submitted_at: "2026-09-01T00:00:00Z" }],
    "/pulls/42/comments": [{ id: 5, path: "src/a.js", line: 3, user: { login: "rev" }, body: "nit" }],
    "/issues/42/comments": [{ user: { login: "dev" }, body: "rebased", created_at: "2026-09-01T01:00:00Z" }],
    "/commits/deadbeef1234/check-runs": { check_runs: [{ name: "unit", status: "completed", conclusion: "failure", html_url: "https://logs" }] },
    "/commits/deadbeef1234/status": { statuses: [] },
    "/pulls/42": { number: 42, title: "Fix", state: "open", user: { login: "dev" }, head: { ref: "feat", sha: "deadbeef1234" }, base: { ref: "main" }, additions: 3, deletions: 1, changed_files: 1, mergeable: true, mergeable_state: "clean" },
  });

  const brief = await readPullRequest({ principal, owner: "acme", repo: "widget", number: 42, fetchImpl: impl });
  assert.equal(brief.summary.number, 42);
  assert.equal(brief.checks.state, "failing");
  assert.equal(brief.checks.headSha, "deadbeef1234");
  assert.equal(brief.files[0].path, "src/a.js");
  assert.equal(brief.reviews[0].state, "CHANGES_REQUESTED");
  assert.equal(brief.threads[0].body, "nit");
  assert.equal(brief.comments[0].body, "rebased");
  // Checks must be read for the PR's own head commit, not a branch name.
  assert.ok(seen.some((url) => url.includes("/commits/deadbeef1234/check-runs")));
});

test("a missing pull request is reported as missing, not as an empty brief", async () => {
  const { impl } = routedFetch({});
  await assert.rejects(
    () => readPullRequest({ principal, owner: "acme", repo: "widget", number: 999, fetchImpl: impl }),
    /#999 was not found/,
  );
});
