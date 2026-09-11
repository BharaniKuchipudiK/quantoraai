/**
 * A tool description is a promise, and the model passes it on.
 *
 * Mirrors github-tool-promise.test.ts: the Vercel declarations are checked
 * against what the executor actually returns, so a promised field always
 * exists and a missing one is never papered over with a guess.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  executeVercelToolCall,
  shouldEnableVercelTools,
  vercelFunctionDeclarations,
} from "./vercel-agent-tools.js";

const declaredNames = new Set(vercelFunctionDeclarations.map((tool) => String(tool.name)));

const declaration = (name: string) => {
  const found = vercelFunctionDeclarations.find((tool) => tool.name === name);
  assert.ok(found, `${name} is not declared`);
  return found;
};

const jsonFetch = (byPath: Record<string, unknown>) => (async (url: string) => {
  const path = new URL(url).pathname;
  const match = Object.keys(byPath).find((key) => path.startsWith(key));
  const body = match ? byPath[match] : { error: { message: "unexpected path" } };
  return { ok: Boolean(match), status: match ? 200 : 404, text: async () => JSON.stringify(body) };
}) as any;

test("every declared tool is executable, and every executable tool is declared", async () => {
  const source = await readFile(new URL("./vercel-agent-tools.ts", import.meta.url), "utf8");
  const executed = new Set(
    [...source.matchAll(/case\s+["']([a-z_]+)["']\s*:/g)].map((match) => String(match[1])),
  );
  assert.ok(executed.size > 0, "found no executor cases at all; this gate has stopped reading the file");
  assert.deepEqual([...declaredNames].sort(), [...executed].sort());
});

test("no write is declared, and the module imports nothing that can write", async () => {
  const READ_ONLY_TOOLS = ["list_vercel_deployments", "read_vercel_deployment"];
  assert.deepEqual([...declaredNames].sort(), [...READ_ONLY_TOOLS].sort());
  for (const tool of vercelFunctionDeclarations) {
    assert.match(tool.description, /only reads/i, `${tool.name} must tell the model it only reads`);
  }

  const source = await readFile(new URL("./vercel-agent-tools.ts", import.meta.url), "utf8");
  const imports = source.slice(source.indexOf("\nimport "), source.indexOf("\nexport "));
  for (const writer of ["redeployDeployment", "cancelDeployment", "createDeployment", "deleteDeployment"]) {
    assert.ok(!imports.includes(writer), `${writer} is imported here — a write needs a consent step first, not a tool declaration`);
  }
});

test("without a token, every tool fails closed rather than guessing", async () => {
  const result = await executeVercelToolCall("list_vercel_deployments", { project: "app" }, { vercelToken: null });
  assert.equal(result.ok, false);
  assert.equal(result.status, "not_connected");
  assert.equal(shouldEnableVercelTools({ vercelConfigured: false }), false);
});

test("list_vercel_deployments returns exactly what its description promises", async () => {
  const fetchImpl = jsonFetch({
    "/v6/deployments": {
      deployments: [
        { uid: "dpl_1", url: "app.vercel.app", name: "app", state: "ERROR", target: "production", created: 1_700_000_000_000 },
      ],
    },
  });
  const result = await executeVercelToolCall(
    "list_vercel_deployments",
    { project: "app" },
    { vercelToken: "tok", fetchImpl },
  );
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.deployments[0].state, "ERROR");
  // The description says it does NOT return the build log or failure reason.
  assert.equal(result.deployments[0].errorMessage, undefined);
  assert.equal(result.deployments[0].buildLog, undefined);
});

test("read_vercel_deployment returns the deployment AND its build log, per its description", async () => {
  const fetchImpl = jsonFetch({
    "/v13/deployments/dpl_1": {
      uid: "dpl_1",
      url: "app.vercel.app",
      name: "app",
      readyState: "ERROR",
      target: "production",
      errorMessage: { message: "Command \"npm run build\" exited with 1", code: "BUILD_FAILED" },
    },
    "/v3/deployments/dpl_1/events": [
      { payload: { text: "Error: Cannot find module '@/components/x'" } },
    ],
  });
  const result = await executeVercelToolCall(
    "read_vercel_deployment",
    { deploymentId: "dpl_1" },
    { vercelToken: "tok", fetchImpl },
  );
  assert.equal(result.ok, true);
  assert.equal(result.deployment.errorCode, "BUILD_FAILED");
  assert.equal(result.buildLog.length, 1);
  assert.match(result.buildLog[0], /Cannot find module/);
  assert.equal(result.buildLogTruncated, false);
});

test("read_vercel_deployment still answers with the deployment when the build log read fails", async () => {
  // A build log read can fail on its own (e.g. a static deployment with no
  // build step); that must not sink an otherwise-successful deployment read.
  const fetchImpl = (async (url: string) => {
    if (url.includes("/v13/deployments/")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ uid: "dpl_1", readyState: "READY" }) };
    }
    return { ok: false, status: 500, text: async () => JSON.stringify({ error: { message: "boom" } }) };
  }) as any;

  const result = await executeVercelToolCall(
    "read_vercel_deployment",
    { deploymentId: "dpl_1" },
    { vercelToken: "tok", fetchImpl },
  );
  assert.equal(result.ok, true);
  assert.equal(result.deployment.state, "READY");
  assert.deepEqual(result.buildLog, []);
});

test("a Vercel read failure is reported as a failure to read, never a clean deploy", async () => {
  const fetchImpl = (async () => ({
    ok: false,
    status: 403,
    text: async () => JSON.stringify({ error: { message: "Not authorized" } }),
  })) as any;

  const result = await executeVercelToolCall(
    "list_vercel_deployments",
    { project: "app" },
    { vercelToken: "tok", fetchImpl },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Not authorized/);
  assert.match(declaration("list_vercel_deployments").description, /only reads/i);
});
