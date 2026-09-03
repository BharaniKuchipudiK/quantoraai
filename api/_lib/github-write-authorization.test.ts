/**
 * The class this closes: a GitHub mutation that runs on identity alone.
 *
 * Security issue #452 was not "the shared token was misconfigured". It was that
 * an active Quantora session, plus a credential the server happened to hold,
 * was treated as authorization to act on a repository. The containment answer
 * was to disable writes entirely; this file is the answer that lets them work.
 *
 * Each test below asserts BOTH directions, per CLAUDE.md §2 — the refusal
 * happens when permission is absent, and the same call succeeds when GitHub
 * grants it. A one-directional test would pass just as happily against a
 * function that refuses everything, which is where this code started.
 *
 * The zero-mutating-calls assertion is the load-bearing half. A write that is
 * refused AFTER the POST has already left is not refused at all.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { commentOnPullRequest, createPullRequest, mergePullRequest } from "./github-actions.js";

const principal = { userSub: "u", login: "octo", token: "gho_x", scopes: ["repo"], connectedAt: "" };

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A fake GitHub that records every mutating request. `permissions` is what the
 * repository endpoint reports back — the single fact every write depends on.
 */
function fakeGithub(options: {
  permissions: Record<string, boolean> | null;
  archived?: boolean;
  pull?: Record<string, unknown>;
  onWrite?: (url: string, method: string) => { status: number; body: unknown };
}) {
  const mutations: Array<{ url: string; method: string }> = [];

  const impl = async (url: string, init: any = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    if (MUTATING.has(method)) mutations.push({ url, method });

    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    });

    if (MUTATING.has(method)) {
      const result = options.onWrite?.(url, method) || { status: 201, body: { html_url: "https://github.com/acme/widget/pull/1", number: 1, merged: true, sha: "newsha" } };
      return reply(result.status, result.body);
    }

    if (/\/pulls\/\d+$/.test(url)) {
      return reply(200, options.pull || { number: 42, state: "open", head: { ref: "feat", sha: "deadbeef1234" }, base: { ref: "main" } });
    }

    // GET /repos/{owner}/{repo} — the authorization answer.
    return reply(200, {
      name: "widget",
      owner: { login: "acme" },
      default_branch: "main",
      archived: options.archived === true,
      ...(options.permissions ? { permissions: options.permissions } : {}),
    });
  };

  return { impl, mutations };
}

const readOnlyCases: Array<[string, (context: any) => Promise<unknown>]> = [
  ["createPullRequest", (context) => createPullRequest(context, { title: "T", head: "feat", base: "main" })],
  ["commentOnPullRequest", (context) => commentOnPullRequest(context, { number: 42, body: "hello" })],
  ["mergePullRequest", (context) => mergePullRequest(context, { number: 42, expectedHeadSha: "deadbeef1234" })],
];

for (const [name, run] of readOnlyCases) {
  test(`${name} refuses a read-only principal and sends nothing`, async () => {
    const github = fakeGithub({ permissions: { pull: true } });
    await assert.rejects(() => run({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }), /not enough to write/);
    assert.deepEqual(github.mutations, [], "a refused write must reach GitHub zero times");
  });

  test(`${name} refuses when GitHub reports no permissions at all`, async () => {
    const github = fakeGithub({ permissions: null });
    await assert.rejects(() => run({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }));
    assert.deepEqual(github.mutations, []);
  });

  test(`${name} refuses on an archived repository`, async () => {
    const github = fakeGithub({ permissions: { pull: true, push: true }, archived: true });
    await assert.rejects(() => run({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }), /archived/i);
    assert.deepEqual(github.mutations, []);
  });
}

test("createPullRequest proceeds when GitHub grants push, and opens a draft by default", async () => {
  const github = fakeGithub({
    permissions: { pull: true, push: true },
    onWrite: () => ({ status: 201, body: { number: 7, title: "T", state: "open", draft: true, head: { ref: "feat", sha: "s" }, base: { ref: "main" }, html_url: "https://github.com/acme/widget/pull/7" } }),
  });
  const result = await createPullRequest(
    { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
    { title: "T", head: "feat", base: "main" },
  );
  assert.equal(result.pullRequest.number, 7);
  assert.equal(result.pullRequest.draft, true);
  assert.equal(result.permission.level, "write");
  assert.equal(github.mutations.length, 1);
  assert.equal(github.mutations[0].method, "POST");
});

test("commentOnPullRequest proceeds when GitHub grants push", async () => {
  const github = fakeGithub({
    permissions: { pull: true, push: true },
    onWrite: () => ({ status: 201, body: { html_url: "https://github.com/acme/widget/pull/42#issuecomment-1" } }),
  });
  const result = await commentOnPullRequest(
    { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
    { number: 42, body: "looks good" },
  );
  assert.match(result.url, /issuecomment/);
  assert.equal(github.mutations.length, 1);
});

test("a pull request from a branch to itself is refused before GitHub is asked to create it", async () => {
  const github = fakeGithub({ permissions: { pull: true, push: true } });
  await assert.rejects(
    () => createPullRequest({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }, { title: "T", head: "main", base: "main" }),
    /branch to itself/,
  );
  assert.deepEqual(github.mutations, []);
});

test("merge refuses without the exact commit the reviewer approved", async () => {
  const github = fakeGithub({ permissions: { pull: true, push: true } });
  await assert.rejects(
    () => mergePullRequest({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }, { number: 42, expectedHeadSha: "" }),
    /exact head commit you reviewed/,
  );
  assert.deepEqual(github.mutations, [], "a merge with no named commit must not reach GitHub");
});

test("merge refuses when the head moved after review, and says what changed", async () => {
  const github = fakeGithub({
    permissions: { pull: true, push: true },
    pull: { number: 42, state: "open", head: { ref: "feat", sha: "9999newcommit" }, base: { ref: "main" } },
  });
  await assert.rejects(
    () => mergePullRequest({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }, { number: 42, expectedHeadSha: "deadbeef1234" }),
    /has moved since you reviewed it/,
  );
  assert.deepEqual(github.mutations, [], "a stale approval must not merge new code");
});

test("merge refuses a closed pull request", async () => {
  const github = fakeGithub({
    permissions: { pull: true, push: true },
    pull: { number: 42, state: "closed", head: { ref: "feat", sha: "deadbeef1234" }, base: { ref: "main" } },
  });
  await assert.rejects(
    () => mergePullRequest({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }, { number: 42, expectedHeadSha: "deadbeef1234" }),
    /is closed/,
  );
  assert.deepEqual(github.mutations, []);
});

test("merge sends the approved SHA to GitHub so GitHub enforces it too", async () => {
  let sentBody: any = null;
  const github = fakeGithub({ permissions: { pull: true, push: true } });
  const wrapped = async (url: string, init: any = {}) => {
    if (String(init.method || "GET").toUpperCase() === "PUT") sentBody = JSON.parse(init.body);
    return github.impl(url, init);
  };
  const result = await mergePullRequest(
    { principal, owner: "acme", repo: "widget", fetchImpl: wrapped },
    { number: 42, expectedHeadSha: "deadbeef1234", mergeMethod: "squash" },
  );
  assert.equal(result.merged, true);
  // Quantora checking the SHA is not enough on its own: between that check and
  // the merge, the head can still move. GitHub must be told which commit.
  assert.equal(sentBody.sha, "deadbeef1234");
  assert.equal(sentBody.merge_method, "squash");
});

test("GitHub refusing a merge is reported as a refusal, not an outage", async () => {
  const github = fakeGithub({
    permissions: { pull: true, push: true },
    onWrite: () => ({ status: 405, body: { message: "Required status check \"ci\" is expected." } }),
  });
  await assert.rejects(
    () => mergePullRequest({ principal, owner: "acme", repo: "widget", fetchImpl: github.impl }, { number: 42, expectedHeadSha: "deadbeef1234" }),
    /Required status check/,
  );
});
