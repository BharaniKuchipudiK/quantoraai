import assert from "node:assert/strict";
import test from "node:test";
import { appOrigin } from "./app-origin.js";

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

test("appOrigin prefers the request host over stale APP_URL", () => {
  withEnv({ APP_URL: "https://quantrora-app.vercel.app", VERCEL: "1" }, () => {
    assert.equal(
      appOrigin({ headers: { host: "quantoraai.app", "x-forwarded-proto": "https" } }),
      "https://quantoraai.app",
    );
  });
});

test("appOrigin falls back to APP_URL without a request", () => {
  withEnv({ APP_URL: "https://quantoraai.app" }, () => {
    assert.equal(appOrigin(), "https://quantoraai.app");
  });
});
