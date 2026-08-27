import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveGithubOAuthClientId,
  resolveGithubOAuthClientSecret,
  resolveGoogleClientId,
} from "./auth-env.js";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("resolveGoogleClientId prefers VITE_GOOGLE_CLIENT_ID", () => {
  withEnv({ VITE_GOOGLE_CLIENT_ID: " vite-id ", GOOGLE_CLIENT_ID: "server-id" }, () => {
    assert.equal(resolveGoogleClientId(), "vite-id");
  });
});

test("resolveGoogleClientId falls back to GOOGLE_CLIENT_ID", () => {
  withEnv({ VITE_GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_ID: "server-id" }, () => {
    assert.equal(resolveGoogleClientId(), "server-id");
  });
});

test("resolveGithubOAuthClientId accepts GITHUB_OAUTH_CLIENT_ID alias", () => {
  withEnv({ GITHUB_OAUTH_CLIENT_ID: "gh-oauth-id" }, () => {
    assert.equal(resolveGithubOAuthClientId(), "gh-oauth-id");
  });
});

test("resolveGithubOAuthClientSecret accepts GITHUB_OAUTH_CLIENT_SECRET alias", () => {
  withEnv({ GITHUB_OAUTH_CLIENT_SECRET: "gh-secret" }, () => {
    assert.equal(resolveGithubOAuthClientSecret(), "gh-secret");
  });
});

test("recover GitHub OAuth when Vercel key is the client id itself", () => {
  withEnv({ Ov23liPvrsDBTXGqV16r: "ghp_client_secret_value" }, () => {
    assert.equal(resolveGithubOAuthClientId(), "Ov23liPvrsDBTXGqV16r");
    assert.equal(resolveGithubOAuthClientSecret(), "ghp_client_secret_value");
  });
});
