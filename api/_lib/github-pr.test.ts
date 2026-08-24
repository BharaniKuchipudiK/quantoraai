import assert from "node:assert/strict";
import test from "node:test";
import {
  githubWriteAuthMessage,
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

test("write-auth message is honest about missing credentials and no desk push", () => {
  assert.match(githubWriteAuthMessage(), /GITHUB_TOKEN/);
  assert.match(githubWriteAuthMessage(), /cannot push/i);
});
