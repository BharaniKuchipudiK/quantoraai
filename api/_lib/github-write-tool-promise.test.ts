/**
 * A tool description is a promise, and the model passes it on — see
 * github-tool-promise.test.ts for the incident this class of test closes.
 *
 * These are WRITE tools, so the stakes are higher than a wrong description of
 * a read: a promise that this "opens a pull request" while the executor
 * merges it, or a failure that reads as success, is not a wrong sentence to
 * the user — it is an action taken on their repository they did not expect.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  executeGithubWriteToolCall,
  githubWriteFunctionDeclarations,
  shouldEnableGithubWriteTools,
} from "./github-write-agent-tools.js";

const declaredNames = new Set(githubWriteFunctionDeclarations.map((tool) => String(tool.name)));

const principal = { userSub: "u", token: "gh-test-token", login: "octocat", scopes: ["repo"], connectedAt: "" } as any;

/** A GitHub reply carrying one JSON body, in the shape githubRequest reads. */
const fetchReturning = (body: unknown, status = 200) => (async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})) as any;

/** A fake GitHub that answers the permission pre-check GET and then every write. */
function fakeGithub(options: {
  permissions?: Record<string, boolean>;
  onWrite?: (url: string, method: string) => { status: number; body: unknown };
}) {
  const requests: Array<{ url: string; method: string }> = [];
  const impl = (async (url: string, init: any = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    requests.push({ url, method });
    if (method !== "GET") {
      if (options.onWrite) {
        const result = options.onWrite(url, method);
        return { ok: result.status >= 200 && result.status < 300, status: result.status, text: async () => JSON.stringify(result.body) };
      }
      // Route each git-data-api write to a body carrying the field the real
      // pushFilesToRepository actually reads from it, so a fake success looks
      // like the real multi-hop write it stands in for.
      if (/\/git\/blobs$/.test(url)) return { ok: true, status: 201, text: async () => JSON.stringify({ sha: "blob-sha" }) };
      if (/\/git\/trees$/.test(url)) return { ok: true, status: 201, text: async () => JSON.stringify({ sha: "tree-sha" }) };
      if (/\/git\/commits$/.test(url)) return { ok: true, status: 201, text: async () => JSON.stringify({ sha: "commit-sha" }) };
      if (/\/git\/refs/.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ ref: "refs/heads/fix" }) };
      if (/\/pulls$/.test(url)) {
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ html_url: "https://github.com/acme/widget/pull/1", number: 1, state: "open", head: { ref: "fix", sha: "deadbeef1234" }, base: { ref: "main" } }),
        };
      }
      return { ok: true, status: 201, text: async () => JSON.stringify({}) };
    }
    if (/\/git\/ref\/heads\//.test(url)) return { ok: false, status: 404, text: async () => JSON.stringify({}) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        name: "widget",
        owner: { login: "acme" },
        default_branch: "main",
        ...(options.permissions ? { permissions: options.permissions } : {}),
      }),
    };
  }) as any;
  return { impl, requests };
}

test("every declared tool is executable, and every executable tool is declared", async () => {
  const source = await readFile(new URL("./github-write-agent-tools.ts", import.meta.url), "utf8");
  const executed = new Set(
    [...source.matchAll(/case\s+["']([a-z_]+)["']\s*:/g)].map((match) => String(match[1])),
  );
  assert.ok(executed.size > 0, "found no executor cases at all; this gate has stopped reading the file");
  assert.deepEqual([...declaredNames].sort(), [...executed].sort());
});

test("merge is never declared, and the module imports nothing that can merge", async () => {
  const READ_WRITE_TOOLS = ["push_files_to_repository", "create_pull_request"];
  assert.deepEqual([...declaredNames].sort(), [...READ_WRITE_TOOLS].sort());

  const source = await readFile(new URL("./github-write-agent-tools.ts", import.meta.url), "utf8");
  const imports = source.slice(source.indexOf("\nimport "), source.indexOf("\nexport "));
  assert.ok(!imports.includes("mergePullRequest"), "mergePullRequest is imported here — merging must stay a human-only action");
  assert.ok(!imports.includes("createRepository"), "createRepository is imported here — creating a new repository is out of this tool's declared scope");
});

test("create_pull_request's own description says merging is not something it does", () => {
  const found = githubWriteFunctionDeclarations.find((tool) => tool.name === "create_pull_request");
  assert.match(found.description, /Does NOT merge/);
  assert.match(found.description, /human to click merge/);
});

test("no connection fails closed, and says the actionable thing", async () => {
  const result = await executeGithubWriteToolCall(
    "create_pull_request",
    { owner: "acme", repo: "widget", title: "Fix build", head: "fix" },
    { principal: null },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "not_connected");
});

test("tools are offered only to a connected account", () => {
  assert.equal(shouldEnableGithubWriteTools({ hasGithubConnection: true }), true);
  assert.equal(shouldEnableGithubWriteTools({ hasGithubConnection: false }), false);
  assert.equal(shouldEnableGithubWriteTools(), false);
});

test("push_files_to_repository returns exactly what its description promises, and never opens a pull request", async () => {
  const { impl, requests } = fakeGithub({ permissions: { push: true } });
  const result = await executeGithubWriteToolCall(
    "push_files_to_repository",
    { owner: "acme", repo: "widget", message: "Fix the build", files: [{ path: "api/x.ts", content: "export {}" }] },
    { principal, fetchImpl: impl },
  );
  assert.equal(result.ok, true);
  assert.ok(result.commitSha);
  assert.equal(result.fileCount, 1);
  assert.equal(result.pullRequest, undefined, "push_files_to_repository must not also open a pull request");
  assert.ok(!requests.some((r) => /\/pulls$/.test(r.url)), "no pull request endpoint should be touched by a push");
});

test("create_pull_request returns an OPEN pull request and says so, never a merged one", async () => {
  const { impl, requests } = fakeGithub({ permissions: { push: true } });
  const result = await executeGithubWriteToolCall(
    "create_pull_request",
    { owner: "acme", repo: "widget", title: "Fix the build", head: "fix" },
    { principal, fetchImpl: impl },
  );
  assert.equal(result.ok, true);
  assert.equal(result.pullRequest.number, 1);
  assert.match(result.note, /OPEN, not merged/);
  assert.ok(!requests.some((r) => /\/merge$/.test(r.url)), "create_pull_request must never call the merge endpoint");
});

test("a repository the user cannot write to refuses the write before it reaches GitHub, not after", async () => {
  const { impl, requests } = fakeGithub({ permissions: { push: false } });
  const result = await executeGithubWriteToolCall(
    "create_pull_request",
    { owner: "acme", repo: "widget", title: "Fix the build", head: "fix" },
    { principal, fetchImpl: impl },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot see|not enough|authorization/i);
  assert.ok(!requests.some((r) => r.method === "POST"), "no POST may reach GitHub once permission is refused");
});

test("a write failure never reads as though it happened anyway", async () => {
  const { impl } = fakeGithub({
    permissions: { push: true },
    onWrite: () => ({ status: 422, body: { message: "Validation failed" } }),
  });
  const result = await executeGithubWriteToolCall(
    "create_pull_request",
    { owner: "acme", repo: "widget", title: "Fix the build", head: "fix" },
    { principal, fetchImpl: impl },
  );
  assert.equal(result.ok, false);
  assert.match(result.note, /Nothing was written/);
});
