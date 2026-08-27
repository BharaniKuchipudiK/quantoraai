import assert from "node:assert/strict";
import test from "node:test";
import { appOrigin, oauthOrigin } from "./app-origin.js";

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

test("oauthOrigin prefers quantoraai.app over stale APP_URL", () => {
  withEnv({
    APP_URL: "https://quantrora-app.vercel.app",
    VERCEL: "1",
    VERCEL_PROJECT_PRODUCTION_URL: "quantoraai.app",
  }, () => {
    assert.equal(
      oauthOrigin({ headers: { host: "quantoraai.app", "x-forwarded-proto": "https" } }),
      "https://quantoraai.app",
    );
  });
});

test("appOrigin ignores request headers for emailed links", () => {
  withEnv({
    APP_URL: "https://quantoraai.app",
    VERCEL_PROJECT_PRODUCTION_URL: "quantoraai.app",
  }, () => {
    assert.equal(
      appOrigin(),
      "https://quantoraai.app",
    );
    assert.equal(
      oauthOrigin({ headers: { host: "evil.example", "x-forwarded-proto": "https" } }),
      "https://quantoraai.app",
    );
  });
});

test("appOrigin prefers VERCEL_PROJECT_PRODUCTION_URL over stale APP_URL", () => {
  withEnv({
    APP_URL: "https://quantrora-app.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "quantoraai.app",
  }, () => {
    assert.equal(appOrigin(), "https://quantoraai.app");
  });
});
