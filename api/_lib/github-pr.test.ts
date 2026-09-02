import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGithubSharedWriteAuthorized,
  assertGithubWriteAllowed,
  createGithubPullRequest,
  githubWriteAuthMessage,
  mergeGithubPullRequest,
  normalizeCreatePullRequestInput,
  resolveGithubToken,
} from "./github-pr.js";

test("resolves GITHUB_TOKEN / GITHUB_PAT / GH_TOKEN", () => {
  assert.equal(resolveGithubToken({} as NodeJS.ProcessEnv), null);
  assert.equal(resolveGithubToken({ GITHUB_TOKEN: " ghp_a " } as NodeJS.ProcessEnv), "ghp_a");
  assert.equal(resolveGithubToken({ GITHUB_PAT: "ghp_b" } as NodeJS.ProcessEnv), "ghp_b");
  assert.equal(resolveGithubToken({ GH_TOKEN: "ghp_c" } as NodeJS.ProcessEnv), "ghp_c");
});

test("create-pr input requires repo, title, and head branch", () => {
  assert.throws(() => normalizeCreatePullRequestInput({}), /repository URL/i);
  assert.throws(() => normalizeCreatePullRequestInput({
    repoUrl: "https://github.com/acme/widget",
  }), /title/i);
  assert.throws(() => normalizeCreatePullRequestInput({
    repoUrl: "https://github.com/acme/widget",
    title: "Desk",
  }), /head branch/i);

  const normalized = normalizeCreatePullRequestInput({
    repoUrl: "https://github.com/acme/widget.git",
    title: "Desk changes",
    head: "quantora-desk",
  });
  assert.equal(normalized.base, "main");
  assert.equal(normalized.head, "quantora-desk");
});

test("write-auth message is honest about disabled shared writes and remaining prerequisites", () => {
  assert.match(githubWriteAuthMessage(), /temporarily disabled/i);
  assert.match(githubWriteAuthMessage(), /server-authorized/i);
  assert.match(githubWriteAuthMessage(), /GITHUB_TOKEN/);
  assert.match(githubWriteAuthMessage(), /GITHUB_ALLOWED_REPOS/);
  assert.match(githubWriteAuthMessage(), /cannot push/i);
});

test("write allowlist fails closed without GITHUB_ALLOWED_REPOS", () => {
  assert.throws(
    () => assertGithubWriteAllowed("https://github.com/acme/widget", {} as NodeJS.ProcessEnv),
    /GITHUB_ALLOWED_REPOS/,
  );
  assert.throws(
    () => assertGithubWriteAllowed("https://github.com/acme/widget", {
      GITHUB_ALLOWED_REPOS: "other/repo",
    } as NodeJS.ProcessEnv),
    /not on the GITHUB_ALLOWED_REPOS allowlist/,
  );
  assert.deepEqual(
    assertGithubWriteAllowed("https://github.com/Acme/Widget.git", {
      GITHUB_ALLOWED_REPOS: "acme/widget, other/repo",
    } as NodeJS.ProcessEnv),
    { owner: "Acme", repo: "Widget" },
  );
});

test("shared GitHub write gate is an unconditional fail-closed containment", () => {
  assert.throws(
    () => assertGithubSharedWriteAuthorized(),
    /temporarily disabled/i,
  );
});

test("shared-token Create PR and Merge make zero network calls while containment is active", async () => {
  const originalFetch = global.fetch;
  const priorAllowlist = process.env.GITHUB_ALLOWED_REPOS;
  let calls = 0;
  process.env.GITHUB_ALLOWED_REPOS = "acme/widget";
  global.fetch = async () => {
    calls += 1;
    throw new Error("network must not be reached");
  };

  try {
    await assert.rejects(
      () => createGithubPullRequest({
        repoUrl: "https://github.com/acme/widget",
        title: "Desk changes",
        head: "quantora-desk",
      }, "ghp_shared"),
      /temporarily disabled/i,
    );
    await assert.rejects(
      () => mergeGithubPullRequest({
        repoUrl: "https://github.com/acme/widget",
        number: 42,
      }, "ghp_shared"),
      /temporarily disabled/i,
    );
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
    if (priorAllowlist === undefined) delete process.env.GITHUB_ALLOWED_REPOS;
    else process.env.GITHUB_ALLOWED_REPOS = priorAllowlist;
  }
});
