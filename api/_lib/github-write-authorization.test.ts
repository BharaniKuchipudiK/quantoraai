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
import {
  commentOnPullRequest,
  createPullRequest,
  createRepository,
  mergePullRequest,
  pushFilesToRepository,
} from "./github-actions.js";

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

/* ------------------------------------------------------------------ *
 * Putting files into a repository
 * ------------------------------------------------------------------ */

/**
 * A fake git-data API. Push touches six endpoints, and the property that
 * matters is not "did a commit appear" but WHEN the branch moves: exactly once,
 * last, after every blob and the tree are already staged. A push that moved the
 * ref first and then failed would leave the user's branch pointing at a tree
 * that does not contain their files.
 */
function fakeGitData(options: {
  permissions: Record<string, boolean> | null;
  refExists?: boolean;
  onRefWrite?: () => { status: number; body: unknown };
}) {
  const mutations: Array<{ url: string; method: string; body: any }> = [];

  const impl = async (url: string, init: any = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    if (MUTATING.has(method)) mutations.push({ url, method, body });

    const reply = (status: number, payload: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    });

    if (method === "POST" && url.includes("/git/blobs")) return reply(201, { sha: "blobsha" });
    if (method === "POST" && url.includes("/git/trees")) return reply(201, { sha: "treesha" });
    if (method === "POST" && url.includes("/git/commits")) return reply(201, { sha: "commitsha" });
    if (url.includes("/git/refs")) {
      const result = options.onRefWrite?.() || { status: method === "POST" ? 201 : 200, body: { object: { sha: "commitsha" } } };
      return reply(result.status, result.body);
    }

    if (url.includes("/git/ref/heads/")) {
      return options.refExists === false
        ? reply(404, { message: "Not Found" })
        : reply(200, { object: { sha: "parentsha" } });
    }
    if (url.includes("/git/commits/")) return reply(200, { tree: { sha: "parenttree" } });

    return reply(200, {
      name: "widget",
      owner: { login: "acme" },
      default_branch: "main",
      ...(options.permissions ? { permissions: options.permissions } : {}),
    });
  };

  return { impl, mutations };
}

const oneFile = [{ path: "index.html", content: "<h1>hi</h1>" }];

test("pushFilesToRepository refuses a read-only principal and sends nothing", async () => {
  const github = fakeGitData({ permissions: { pull: true } });
  await assert.rejects(
    () => pushFilesToRepository(
      { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
      { files: oneFile, message: "first commit" },
    ),
    /not enough to write/,
  );
  assert.deepEqual(github.mutations, [], "a refused push must reach GitHub zero times");
});

test("pushFilesToRepository writes blobs and tree before moving the branch, exactly once", async () => {
  const github = fakeGitData({ permissions: { pull: true, push: true } });
  const result = await pushFilesToRepository(
    { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
    { files: [{ path: "index.html", content: "<h1>hi</h1>" }, { path: "app.js", content: "1" }], message: "ship it" },
  );

  assert.equal(result.commitSha, "commitsha");
  assert.equal(result.fileCount, 2);
  assert.equal(result.createdBranch, false);

  const refWrites = github.mutations.filter((entry) => entry.url.includes("/git/refs"));
  assert.equal(refWrites.length, 1, "the branch must move exactly once");
  assert.equal(refWrites[0].method, "PATCH");
  assert.equal(github.mutations.at(-1)?.url.includes("/git/refs"), true, "the branch must move last of all");
  assert.equal(github.mutations.filter((entry) => entry.url.includes("/git/blobs")).length, 2);
});

test("the first push into an empty repository creates the branch and has no parent", async () => {
  const github = fakeGitData({ permissions: { pull: true, push: true }, refExists: false });
  const result = await pushFilesToRepository(
    { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
    { files: oneFile, message: "first commit" },
  );

  assert.equal(result.createdBranch, true);
  const commit = github.mutations.find((entry) => entry.url.endsWith("/git/commits"));
  assert.equal(commit?.body.parents, undefined, "a repository with no commits has no parent to name");
  const ref = github.mutations.find((entry) => entry.url.endsWith("/git/refs"));
  assert.equal(ref?.method, "POST");
  assert.equal(ref?.body.ref, "refs/heads/main");
});

test("a push that would discard someone else's commit is reported as exactly that", async () => {
  const github = fakeGitData({
    permissions: { pull: true, push: true },
    onRefWrite: () => ({ status: 422, body: { message: "Update is not a fast forward" } }),
  });
  await assert.rejects(
    () => pushFilesToRepository(
      { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
      { files: oneFile, message: "ship it" },
    ),
    /would have discarded someone else's commit/,
  );
});

test("the branch is never force-moved", async () => {
  const github = fakeGitData({ permissions: { pull: true, push: true } });
  await pushFilesToRepository(
    { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
    { files: oneFile, message: "ship it" },
  );
  const ref = github.mutations.find((entry) => entry.url.includes("/git/refs"));
  assert.equal(ref?.body.force, false, "force:true would overwrite a colleague's work");
});

test("a path escaping the repository is refused before anything is written", async () => {
  const github = fakeGitData({ permissions: { pull: true, push: true } });
  await assert.rejects(
    () => pushFilesToRepository(
      { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
      { files: [{ path: "../../etc/passwd", content: "x" }], message: "ship it" },
    ),
    /points outside the repository/,
  );
  assert.deepEqual(github.mutations, []);
});

test("writing into .git is refused", async () => {
  const github = fakeGitData({ permissions: { pull: true, push: true } });
  await assert.rejects(
    () => pushFilesToRepository(
      { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
      { files: [{ path: ".git/config", content: "x" }], message: "ship it" },
    ),
    /git's own storage/,
  );
  assert.deepEqual(github.mutations, []);
});

test("the same path twice is refused rather than silently resolved", async () => {
  const github = fakeGitData({ permissions: { pull: true, push: true } });
  await assert.rejects(
    () => pushFilesToRepository(
      { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
      { files: [{ path: "a.js", content: "1" }, { path: "a.js", content: "2" }], message: "ship it" },
    ),
    /appears twice/,
  );
  assert.deepEqual(github.mutations, []);
});

test("a commit with no message is refused before anything is written", async () => {
  const github = fakeGitData({ permissions: { pull: true, push: true } });
  await assert.rejects(
    () => pushFilesToRepository(
      { principal, owner: "acme", repo: "widget", fetchImpl: github.impl },
      { files: oneFile, message: "   " },
    ),
    /needs a real message/,
  );
  assert.deepEqual(github.mutations, []);
});

/* ------------------------------------------------------------------ *
 * Creating a repository
 * ------------------------------------------------------------------ */

function fakeAccount(options: {
  login?: string;
  membership?: { state: string; role: string } | null;
  membersCanCreate?: boolean | null;
}) {
  const mutations: Array<{ url: string; method: string; body: any }> = [];

  const impl = async (url: string, init: any = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    if (MUTATING.has(method)) mutations.push({ url, method, body });

    const reply = (status: number, payload: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload),
    });

    if (MUTATING.has(method)) {
      return reply(201, {
        name: body?.name,
        full_name: `${body?.name === "widget" ? "octo" : "acme"}/${body?.name}`,
        owner: { login: url.includes("/orgs/") ? "acme" : "octo" },
        html_url: "https://github.com/octo/widget",
        default_branch: "main",
        private: body?.private,
      });
    }

    if (url.endsWith("/user")) return reply(200, { login: options.login || "octo" });
    if (url.includes("/user/memberships/orgs/")) {
      return options.membership
        ? reply(200, options.membership)
        : reply(404, { message: "Not Found" });
    }
    if (url.includes("/orgs/")) {
      return options.membersCanCreate === null || options.membersCanCreate === undefined
        ? reply(200, {})
        : reply(200, { members_can_create_repositories: options.membersCanCreate });
    }
    return reply(200, {});
  };

  return { impl, mutations };
}

test("createRepository refuses an owner that is neither you nor your organization", async () => {
  const account = fakeAccount({ login: "octo", membership: null });
  await assert.rejects(
    () => createRepository({ principal, fetchImpl: account.impl }, { owner: "someone-else", name: "widget" }),
    /not a member of "someone-else"/,
  );
  assert.deepEqual(account.mutations, [], "an unauthorized create must reach GitHub zero times");
});

test("createRepository refuses an organization that forbids member repository creation", async () => {
  const account = fakeAccount({ login: "octo", membership: { state: "active", role: "member" }, membersCanCreate: false });
  await assert.rejects(
    () => createRepository({ principal, fetchImpl: account.impl }, { owner: "acme", name: "widget" }),
    /does not allow members to create repositories/,
  );
  assert.deepEqual(account.mutations, []);
});

test("createRepository fails closed when GitHub does not report the organization's setting", async () => {
  const account = fakeAccount({ login: "octo", membership: { state: "active", role: "member" }, membersCanCreate: null });
  await assert.rejects(
    () => createRepository({ principal, fetchImpl: account.impl }, { owner: "acme", name: "widget" }),
    /did not report whether members/,
  );
  assert.deepEqual(account.mutations, [], "an unanswered permission question is not a yes");
});

test("createRepository creates in your own account, private by default", async () => {
  const account = fakeAccount({ login: "octo" });
  const result = await createRepository({ principal, fetchImpl: account.impl }, { owner: "octo", name: "widget" });

  assert.equal(result.repo, "widget");
  assert.equal(result.isPrivate, true);
  assert.equal(account.mutations.length, 1);
  assert.equal(account.mutations[0].url.endsWith("/user/repos"), true);
  // The reversible default. A repository cannot be un-published once it exists.
  assert.equal(account.mutations[0].body.private, true);
  assert.equal(account.mutations[0].body.auto_init, false);
});

test("createRepository makes a repository public only when asked", async () => {
  const account = fakeAccount({ login: "octo" });
  const result = await createRepository(
    { principal, fetchImpl: account.impl },
    { owner: "octo", name: "widget", isPrivate: false },
  );
  assert.equal(result.isPrivate, false);
  assert.equal(account.mutations[0].body.private, false);
});

test("createRepository uses the organization endpoint for an org admin", async () => {
  const account = fakeAccount({ login: "octo", membership: { state: "active", role: "admin" } });
  await createRepository({ principal, fetchImpl: account.impl }, { owner: "acme", name: "widget" });
  assert.equal(account.mutations[0].url.includes("/orgs/acme/repos"), true);
});

test("a repository name GitHub would reject is refused before anything is created", async () => {
  const account = fakeAccount({ login: "octo" });
  await assert.rejects(
    () => createRepository({ principal, fetchImpl: account.impl }, { owner: "octo", name: "my repo!" }),
    /not a repository name GitHub accepts/,
  );
  assert.deepEqual(account.mutations, []);
});
