/**
 * The auto-PR opt-in is a SEPARATE decision from having a GitHub connection —
 * see github-write-agent-tools.ts's header for why. This tests the store
 * functions that decision is read from and written to, independent of the
 * (already-tested) token sealing they sit beside.
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.GITHUB_CONNECTION_SECRET = "x".repeat(32);

const { readGithubAutoPrEnabled, setGithubAutoPrEnabled, readGithubConnectionSummary } = await import("./github-connection-store.js");

function fakeSupabase(rows: any[]) {
  const requests: Array<{ url: string; method: string; body: any }> = [];
  const original = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    requests.push({ url, method: String(init.method || "GET"), body: init.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, json: async () => rows };
  };
  return { requests, restore: () => { globalThis.fetch = original; } };
}

test("reads false when no row exists, not an error", async () => {
  const { restore } = fakeSupabase([]);
  try {
    assert.equal(await readGithubAutoPrEnabled("user-1"), false);
  } finally {
    restore();
  }
});

test("reads the stored flag verbatim", async () => {
  const { restore } = fakeSupabase([{ auto_pr_enabled: true }]);
  try {
    assert.equal(await readGithubAutoPrEnabled("user-1"), true);
  } finally {
    restore();
  }
});

test("setting the flag PATCHes only this user's row", async () => {
  const { requests, restore } = fakeSupabase([]);
  try {
    const saved = await setGithubAutoPrEnabled("user-1", true);
    assert.equal(saved, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "PATCH");
    assert.match(requests[0].url, /user_sub=eq\.user-1/);
    assert.equal(requests[0].body.auto_pr_enabled, true);
  } finally {
    restore();
  }
});

test("a store that cannot be reached refuses the write rather than pretending it saved", async () => {
  const original = globalThis.fetch;
  (globalThis as any).fetch = async () => { throw new Error("network down"); };
  try {
    assert.equal(await setGithubAutoPrEnabled("user-1", true), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("the connection summary carries the flag alongside connected state", async () => {
  const { restore } = fakeSupabase([{
    github_login: "octocat",
    sealed_token: "not-a-real-sealed-token",
    scopes: ["repo"],
    connected_at: "2026-01-01T00:00:00.000Z",
    auto_pr_enabled: true,
  }]);
  try {
    const summary = await readGithubConnectionSummary("user-1");
    // The fake sealed token cannot actually be opened, so this reads as
    // unusable — but it must still say autoPrEnabled is a real field, not
    // an object missing the key entirely.
    assert.equal(typeof summary.autoPrEnabled, "boolean");
  } finally {
    restore();
  }
});
