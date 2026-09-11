import assert from "node:assert/strict";
import test from "node:test";
import { resolveSandboxCredentials } from "./sandbox-credentials.js";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("resolves null when any of the three required values is missing", () => {
  withEnv({ VERCEL_SANDBOX_TOKEN: undefined, VERCEL_ACCESS_TOKEN: undefined, VERCEL_TEAM_ID: "team_x", VERCEL_PROJECT_ID: "prj_x" }, () => {
    assert.equal(resolveSandboxCredentials(), null);
  });
  withEnv({ VERCEL_SANDBOX_TOKEN: "tok", VERCEL_TEAM_ID: undefined, VERCEL_PROJECT_ID: "prj_x" }, () => {
    assert.equal(resolveSandboxCredentials(), null);
  });
  withEnv({ VERCEL_SANDBOX_TOKEN: "tok", VERCEL_TEAM_ID: "team_x", VERCEL_PROJECT_ID: undefined }, () => {
    assert.equal(resolveSandboxCredentials(), null);
  });
});

test("resolves a full credential set once all three are present", () => {
  withEnv({ VERCEL_SANDBOX_TOKEN: "tok", VERCEL_ACCESS_TOKEN: undefined, VERCEL_TEAM_ID: "team_x", VERCEL_PROJECT_ID: "prj_x" }, () => {
    assert.deepEqual(resolveSandboxCredentials(), { token: "tok", teamId: "team_x", projectId: "prj_x" });
  });
});

test("falls back to VERCEL_ACCESS_TOKEN when VERCEL_SANDBOX_TOKEN is not set", () => {
  withEnv({ VERCEL_SANDBOX_TOKEN: undefined, VERCEL_ACCESS_TOKEN: "deploy-tok", VERCEL_TEAM_ID: "team_x", VERCEL_PROJECT_ID: "prj_x" }, () => {
    assert.deepEqual(resolveSandboxCredentials(), { token: "deploy-tok", teamId: "team_x", projectId: "prj_x" });
  });
});
