/**
 * A tool description is a promise, and the model passes it on.
 *
 * This repo already paid for that lesson once. `search_hotels` told the model it
 * was REQUIRED for "…or photos" and returned none, so the model invented an
 * explanation — "I cannot render embedded photo feeds" — which was never true,
 * and the user read the invention as fact.
 *
 * The GitHub tools carry the same risk in a worse place: a model that believes
 * it can see a CI log, or set an issue state, will describe someone's repository
 * from an assumption. So these tests check the DECLARATIONS against what the
 * executor actually does, with a stub GitHub that never touches the network.
 *
 * The first version of this module already failed one of these before it was
 * written: list_issues declared a `state` parameter that listIssues() does not
 * accept, so the model could have asked for closed issues, received open ones,
 * and reported them as closed. That is what a dead knob costs, and why the shape
 * is asserted rather than eyeballed.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  executeGithubToolCall,
  githubFunctionDeclarations,
  shouldEnableGithubTools,
} from "./github-agent-tools.js";

/** What the model is actually told it has. Every gate below anchors here. */
const declaredNames = new Set(githubFunctionDeclarations.map((tool) => String(tool.name)));

const principal = { token: "gh-test-token", login: "octocat" } as any;

const declaration = (name: string) => {
  const found = githubFunctionDeclarations.find((tool) => tool.name === name);
  assert.ok(found, `${name} is not declared`);
  return found;
};

/* ------------------------------------------------------------------ *
 * Every declared parameter must reach a real call
 * ------------------------------------------------------------------ */

test("every declared tool is executable, and every executable tool is declared", async () => {
  /*
   * This used to compare the declarations against GITHUB_TOOL_NAMES — one
   * hand-kept list against another, which proved they matched each other and
   * nothing about the executor. With the parallel list gone the check is the
   * one that matters: every name the model is offered has a case in the
   * executor's switch, and the switch has no case nobody is offered.
   */
  const source = await readFile(new URL("./github-agent-tools.ts", import.meta.url), "utf8");
  const executed = new Set(
    [...source.matchAll(/case\s+["']([a-z_]+)["']\s*:/g)].map((match) => String(match[1])),
  );
  // A parse that finds nothing must fail, not report a clean run over zero
  // tools — the mistake test:claims was corrected for.
  assert.ok(executed.size > 0, "found no executor cases at all; this gate has stopped reading the file");
  assert.deepEqual([...declaredNames].sort(), [...executed].sort());
});

test("list_issues does not offer a state knob it cannot honour", () => {
  // listIssues() lists OPEN issues and takes no state. A declared `state` would
  // let the model ask for closed ones, get open ones, and report them as closed.
  const properties = declaration("list_issues").parameters.properties;
  assert.equal(properties.state, undefined, "a parameter wired to nothing lies; a missing one is merely visible");
  assert.match(declaration("list_issues").description, /OPEN issues/);
  assert.match(declaration("list_issues").description, /Cannot list closed issues/);
});

test("a declared state knob IS honoured where one exists", async () => {
  const seen: string[] = [];
  const fetchImpl = (async (url: string) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
  }) as any;

  await executeGithubToolCall(
    "list_pull_requests",
    { owner: "octo", repo: "widget", state: "closed" },
    { principal, fetchImpl },
  );
  assert.ok(seen.some((url) => /state=closed/.test(url)), "list_pull_requests declares state; it must reach GitHub");
});

/* ------------------------------------------------------------------ *
 * No write is declared, and none is reachable
 * ------------------------------------------------------------------ */

/**
 * Precision matters here as much as coverage (CLAUDE.md §5).
 *
 * Two earlier cuts of this test tried to read English. The first flagged
 * read_pull_request for "push", "comment" and "merge" inside its own sentence
 * saying it CANNOT do them. The second, after exempting denials, flagged "head
 * commit SHA" — a noun. Both were about to be tuned a third time.
 *
 * That is the wrong shape for a blocking gate. A rule that argues with prose
 * fires on ambiguous evidence, and a gate that cries wolf is one the next
 * person mutes under pressure — after which it protects nothing (§5).
 *
 * So this asserts STRUCTURE instead, where the evidence is unambiguous:
 * the declared names are an explicit allowlist, and the module does not import
 * anything that can write. A future write tool cannot be added without the
 * import appearing here, and no wording can hide it.
 */
const READ_ONLY_TOOLS = ["read_pull_request", "list_pull_requests", "list_issues"];

test("the declared set is exactly the reviewed read-only set", () => {
  assert.deepEqual([...declaredNames].sort(), [...READ_ONLY_TOOLS].sort());
  for (const tool of githubFunctionDeclarations) {
    assert.match(tool.description, /only reads/i, `${tool.name} must tell the model it only reads`);
  }
});

test("the tool module imports nothing that can write to GitHub", async () => {
  // The structural version of "no writes". A model-callable write cannot be
  // added without one of these names appearing in the import list, whatever the
  // description says about it.
  const source = await readFile(new URL("./github-agent-tools.ts", import.meta.url), "utf8");
  // Everything before the module's first export is its import list, whatever
  // that first export happens to be called.
  const imports = source.slice(0, source.indexOf("\nexport "));
  for (const writer of [
    "pushFilesToRepository",
    "createRepository",
    "createPullRequest",
    "commentOnPullRequest",
    "mergePullRequest",
    "authorizeWrite",
  ]) {
    assert.ok(
      !imports.includes(writer),
      `${writer} is imported here — a model-callable write needs a consent step first, not a tool declaration`,
    );
  }
});

test("a refusing write tool is not declared either", () => {
  // A painted door is worse than a missing one: the model uses it, then explains
  // the refusal to the user in words the platform never wrote. search_hotels
  // promised photos, returned none, and invented "I cannot render embedded
  // photo feeds" — which was never true.
  for (const name of ["push_files", "merge_pull_request", "create_pull_request", "comment_on_pull_request"]) {
    assert.equal(declaredNames.has(name), false, `${name} must not be declared until consent exists`);
  }
});

/* ------------------------------------------------------------------ *
 * Failing to read is never reported as a fact about the repository
 * ------------------------------------------------------------------ */

test("a refused read is not reported as an empty repository", async () => {
  const fetchImpl = (async () => ({
    ok: false,
    status: 404,
    json: async () => ({ message: "Not Found" }),
    text: async () => '{"message":"Not Found"}',
  })) as any;

  const result = await executeGithubToolCall(
    "read_pull_request",
    { owner: "octo", repo: "private", number: 7 },
    { principal, fetchImpl },
  );

  assert.equal(result.ok, false);
  assert.match(result.note, /not a statement about the repository/i);
  assert.match(result.note, /Do not describe the repository as empty/i);
});

test("no connection fails closed, and says the actionable thing", async () => {
  const result = await executeGithubToolCall("list_pull_requests", { owner: "o", repo: "r" }, { principal: null });
  assert.equal(result.ok, false);
  assert.equal(result.status, "not_connected");
  assert.match(result.note, /connect GitHub/i);
});

test("a missing argument is refused before any request is sent", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
  }) as any;

  const result = await executeGithubToolCall("read_pull_request", { owner: "octo", repo: "widget" }, { principal, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(called, false, "a malformed call must not reach GitHub");
  assert.match(result.error, /number/);
});

/* ------------------------------------------------------------------ *
 * The gate that decides whether the model gets these at all
 * ------------------------------------------------------------------ */

test("tools are offered only to a connected account", () => {
  assert.equal(shouldEnableGithubTools({ hasGithubConnection: true }), true);
  assert.equal(shouldEnableGithubTools({ hasGithubConnection: false }), false);
  assert.equal(shouldEnableGithubTools({}), false);
  assert.equal(shouldEnableGithubTools(), false, "a tool that always errors becomes an invented fact about the repo");
});

test("an unknown name is refused rather than silently doing nothing", async () => {
  const result = await executeGithubToolCall("delete_everything", {}, { principal });
  assert.equal(result.ok, false);
  assert.match(result.error, /not a GitHub tool/);
});
