import assert from "node:assert/strict";
import test from "node:test";
import {
  executeSandboxToolCall,
  sandboxFunctionDeclarations,
  shouldEnableSandboxTools,
  type SandboxFactory,
  type SandboxHandle,
} from "./sandbox-agent-tools.js";
import type { GithubPrincipal } from "./github-principal.js";
import type { SandboxCredentials } from "./sandbox-credentials.js";

const PRINCIPAL: GithubPrincipal = {
  subject: "user-1",
  login: "octocat",
  token: "gho_test",
  userSub: "user-1",
  scopes: [],
  connectedAt: new Date().toISOString(),
} as GithubPrincipal;

const CREDENTIALS: SandboxCredentials = { token: "vtok", teamId: "team_1", projectId: "prj_1" };

/**
 * A fake sandbox that records what it was asked to do and returns scripted
 * per-command results, so the executor's contract (clone source it's given,
 * run commands in order, stop at the first failure, always call stop()) can
 * be proven WITHOUT a real Vercel Sandbox or network call. This is the
 * documented substitute mentioned in sandbox-agent-tools.ts's own comment —
 * it proves the contract, not live behaviour against Vercel's infrastructure.
 */
function fakeSandboxFactory(scripted: Record<string, { exitCode: number; output: string }>) {
  const calls: any[] = [];
  const commandCalls: any[] = [];
  let stopped = false;
  const factory: SandboxFactory = async (params) => {
    calls.push(params);
    const handle: SandboxHandle = {
      async runCommand(commandParams) {
        commandCalls.push(commandParams);
        const key = commandParams.args?.[1] ?? "";
        const scriptedResult = scripted[key] ?? { exitCode: 0, output: "" };
        return {
          exitCode: scriptedResult.exitCode,
          output: async () => scriptedResult.output,
        };
      },
      async stop() {
        stopped = true;
      },
    };
    return handle;
  };
  return { factory, calls, commandCalls, wasStopped: () => stopped };
}

test("shouldEnableSandboxTools requires both a GitHub connection and sandbox credentials", () => {
  assert.equal(shouldEnableSandboxTools({ hasGithubConnection: true, sandboxConfigured: true }), true);
  assert.equal(shouldEnableSandboxTools({ hasGithubConnection: true, sandboxConfigured: false }), false);
  assert.equal(shouldEnableSandboxTools({ hasGithubConnection: false, sandboxConfigured: true }), false);
  assert.equal(shouldEnableSandboxTools(), false);
});

test("run_repository_check clones with the user's own credentials and runs commands in order", async () => {
  const { factory, calls, commandCalls, wasStopped } = fakeSandboxFactory({
    "npm install": { exitCode: 0, output: "installed" },
    "npm test": { exitCode: 0, output: "5 passing" },
  });

  const result = await executeSandboxToolCall(
    "run_repository_check",
    { owner: "acme", repo: "widgets", branch: "fix-branch", commands: ["npm install", "npm test"] },
    { principal: PRINCIPAL, credentials: CREDENTIALS, sandboxFactory: factory },
  );

  assert.equal(result.ok, true);
  assert.equal(result.allCommandsPassed, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].output, "installed");
  assert.equal(result.results[1].output, "5 passing");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].source.url, "https://github.com/acme/widgets.git");
  assert.equal(calls[0].source.username, "octocat");
  assert.equal(calls[0].source.password, "gho_test");
  assert.equal(calls[0].source.revision, "fix-branch");
  assert.equal(calls[0].token, "vtok");
  assert.equal(calls[0].teamId, "team_1");
  assert.equal(calls[0].projectId, "prj_1");

  assert.equal(commandCalls.length, 2);
  assert.equal(wasStopped(), true);
});

test("stops at the first failing command and never runs the rest", async () => {
  const { factory, commandCalls, wasStopped } = fakeSandboxFactory({
    "npm install": { exitCode: 0, output: "installed" },
    "npm test": { exitCode: 1, output: "1 failing" },
  });

  const result = await executeSandboxToolCall(
    "run_repository_check",
    { owner: "acme", repo: "widgets", commands: ["npm install", "npm test", "npm run lint"] },
    { principal: PRINCIPAL, credentials: CREDENTIALS, sandboxFactory: factory },
  );

  assert.equal(result.ok, true);
  assert.equal(result.allCommandsPassed, false);
  assert.equal(result.stoppedAtFirstFailure, true);
  assert.equal(result.results.length, 2);
  assert.match(result.note, /do not describe this as passing/i);
  assert.equal(commandCalls.length, 2, "the third command must never run once the second fails");
  assert.equal(wasStopped(), true, "the sandbox must be torn down even after a failing command");
});

test("stops the sandbox even when a command throws", async () => {
  let stopped = false;
  const factory: SandboxFactory = async () => ({
    async runCommand() {
      throw new Error("sandbox connection lost");
    },
    async stop() {
      stopped = true;
    },
  });

  const result = await executeSandboxToolCall(
    "run_repository_check",
    { owner: "acme", repo: "widgets", commands: ["npm test"] },
    { principal: PRINCIPAL, credentials: CREDENTIALS, sandboxFactory: factory },
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /sandbox connection lost/);
  assert.equal(stopped, true);
});

test("refuses without ever creating a sandbox when GitHub or sandbox credentials are missing", async () => {
  const { factory, calls } = fakeSandboxFactory({});
  const result = await executeSandboxToolCall(
    "run_repository_check",
    { owner: "acme", repo: "widgets", commands: ["npm test"] },
    { principal: null, credentials: CREDENTIALS, sandboxFactory: factory },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "not_connected");
  assert.equal(calls.length, 0);
});

test("refuses more than the max allowed commands without creating a sandbox", async () => {
  const { factory, calls } = fakeSandboxFactory({});
  const tooMany = Array.from({ length: 7 }, (_, i) => `echo ${i}`);
  const result = await executeSandboxToolCall(
    "run_repository_check",
    { owner: "acme", repo: "widgets", commands: tooMany },
    { principal: PRINCIPAL, credentials: CREDENTIALS, sandboxFactory: factory },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /at most 6/i);
  assert.equal(calls.length, 0);
});

test("refuses an empty commands list without creating a sandbox", async () => {
  const { factory, calls } = fakeSandboxFactory({});
  const result = await executeSandboxToolCall(
    "run_repository_check",
    { owner: "acme", repo: "widgets", commands: [] },
    { principal: PRINCIPAL, credentials: CREDENTIALS, sandboxFactory: factory },
  );
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("truncates output longer than the model-readable cap", async () => {
  const longOutput = "x".repeat(10_000);
  const factory: SandboxFactory = async () => ({
    async runCommand() {
      return { exitCode: 0, output: async () => longOutput };
    },
    async stop() {},
  });

  const result = await executeSandboxToolCall(
    "run_repository_check",
    { owner: "acme", repo: "widgets", commands: ["npm test"] },
    { principal: PRINCIPAL, credentials: CREDENTIALS, sandboxFactory: factory },
  );

  assert.equal(result.results[0].outputTruncated, true);
  assert.ok(result.results[0].output.length <= 6_000);
});

test("the declared tool name matches what the executor actually serves", () => {
  const names = sandboxFunctionDeclarations.map((d: any) => d.name);
  assert.deepEqual(names, ["run_repository_check"]);
});
