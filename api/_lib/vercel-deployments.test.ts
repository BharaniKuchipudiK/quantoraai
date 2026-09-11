/**
 * Vercel client reads, checked against a fake Vercel that never touches the
 * network. Mirrors github-actions.test.ts-style coverage for the deployment
 * API surface: success shapes, failure shapes, and the build-log truncation
 * that keeps a huge log from drowning the model's context.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  getDeployment,
  getDeploymentBuildLog,
  listDeployments,
} from "./vercel-deployments.js";

function fakeVercel(responses: Record<string, { status: number; body: unknown }>) {
  const seen: string[] = [];
  const fetchImpl = (async (url: string) => {
    seen.push(url);
    const path = new URL(url).pathname;
    const match = Object.keys(responses).find((key) => path.startsWith(key));
    const response = match ? responses[match] : { status: 404, body: { error: { message: "not found" } } };
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => JSON.stringify(response.body),
    };
  }) as any;
  return { fetchImpl, seen };
}

test("listDeployments requires a project and normalizes state to uppercase", async () => {
  await assert.rejects(() => listDeployments({ token: "test-token", project: "", fetchImpl: fakeVercel({}).fetchImpl }), /project/i);

  const { fetchImpl, seen } = fakeVercel({
    "/v6/deployments": {
      status: 200,
      body: {
        deployments: [
          { uid: "dpl_1", url: "app-abc.vercel.app", name: "app", state: "error", target: "production", created: 1_700_000_000_000 },
          { uid: "dpl_2", url: "app-def.vercel.app", name: "app", readyState: "ready", target: "preview", createdAt: 1_700_000_100_000 },
        ],
      },
    },
  });

  const deployments = await listDeployments({ token: "test-token", project: "app", fetchImpl });
  assert.equal(deployments.length, 2);
  assert.equal(deployments[0].state, "ERROR");
  assert.equal(deployments[0].url, "https://app-abc.vercel.app");
  assert.equal(deployments[1].state, "READY");
  assert.ok(seen.some((url) => /projectId=app/.test(url)));
});

test("listDeployments surfaces Vercel's own error message on failure", async () => {
  const { fetchImpl } = fakeVercel({
    "/v6/deployments": { status: 403, body: { error: { message: "Not authorized for this project" } } },
  });
  await assert.rejects(
    () => listDeployments({ token: "test-token", project: "app", fetchImpl }),
    /Not authorized for this project/,
  );
});

test("getDeployment reads state, error, and git metadata", async () => {
  const { fetchImpl } = fakeVercel({
    "/v13/deployments/dpl_1": {
      status: 200,
      body: {
        uid: "dpl_1",
        url: "app-abc.vercel.app",
        name: "app",
        readyState: "ERROR",
        target: "production",
        errorMessage: { message: "Command \"npm run build\" exited with 1", code: "BUILD_FAILED" },
        meta: { githubCommitRef: "main", githubCommitSha: "abc123" },
      },
    },
  });

  const deployment = await getDeployment({ token: "test-token", deploymentId: "dpl_1", fetchImpl });
  assert.equal(deployment.state, "ERROR");
  assert.equal(deployment.errorCode, "BUILD_FAILED");
  assert.match(deployment.errorMessage || "", /exited with 1/);
  assert.equal(deployment.gitBranch, "main");
  assert.equal(deployment.gitCommitSha, "abc123");
});

test("getDeploymentBuildLog filters to error-shaped lines when asked, and truncates a huge log", async () => {
  const events = [
    { payload: { text: "Installing dependencies..." } },
    { payload: { text: "Running \"npm run build\"" } },
    { payload: { text: "Error: Cannot find module '@/components/x'" } },
  ];
  const { fetchImpl } = fakeVercel({
    "/v3/deployments/dpl_1/events": { status: 200, body: events },
  });

  const full = await getDeploymentBuildLog({ token: "test-token", deploymentId: "dpl_1", fetchImpl });
  assert.equal(full.lines.length, 3);
  assert.equal(full.truncated, false);

  const errorsOnly = await getDeploymentBuildLog({ token: "test-token", deploymentId: "dpl_1", onlyErrors: true, fetchImpl });
  assert.equal(errorsOnly.lines.length, 1);
  assert.match(errorsOnly.lines[0], /Cannot find module/);

  const huge = Array.from({ length: 500 }, (_, index) => ({ payload: { text: `line ${index}` } }));
  const { fetchImpl: hugeFetch } = fakeVercel({ "/v3/deployments/dpl_2/events": { status: 200, body: huge } });
  const truncated = await getDeploymentBuildLog({ token: "test-token", deploymentId: "dpl_2", fetchImpl: hugeFetch });
  assert.equal(truncated.lines.length, 400, "the log must be capped at 400 lines");
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.lines[truncated.lines.length - 1], "line 499", "the tail must be the MOST RECENT lines, not the earliest");
});
