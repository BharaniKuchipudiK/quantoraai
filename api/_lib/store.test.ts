import assert from "node:assert/strict";
import test from "node:test";

// Must be set before importing store.ts so config() sees a configured store.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

const { exportUserData, deleteUserData, purgeOldTelemetry } = await import("./store.js");

type Call = { url: string; method: string };

/** Install a fetch mock that records calls and answers PostgREST reads with `rows`. */
function withFetch(rows: (url: string) => any, run: (calls: Call[]) => Promise<void>) {
  return async () => {
    const calls: Call[] = [];
    const original = global.fetch;
    global.fetch = (async (url: any, init: any = {}) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method || "GET" });
      const body = init?.method && init.method !== "GET" ? null : JSON.stringify(rows(u));
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;
    try {
      await run(calls);
    } finally {
      global.fetch = original;
    }
  };
}

test("deleteUserData issues a scoped DELETE against the users table", withFetch(
  () => [],
  async (calls) => {
    const ok = await deleteUserData("user-42");
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "DELETE");
    assert.match(calls[0].url, /\/rest\/v1\/users\?google_sub=eq\.user-42$/);
    // Never a blanket delete without the owner filter.
    assert.doesNotMatch(calls[0].url, /users$/);
  },
));

test("purgeOldTelemetry deletes only rows older than the cutoff, on both telemetry tables", withFetch(
  () => [],
  async (calls) => {
    const res = await purgeOldTelemetry(30);
    assert.equal(res.ok, true);
    const usage = calls.find((c) => c.url.includes("/rest/v1/usage?"));
    const events = calls.find((c) => c.url.includes("/rest/v1/product_events?"));
    assert.ok(usage && events, "both telemetry tables purged");
    for (const c of [usage!, events!]) {
      assert.equal(c.method, "DELETE");
      assert.match(c.url, /created_at=lt\./); // strictly less-than a cutoff, never all rows
    }
    // Cutoff must be a real ISO timestamp ~30 days ago.
    const cutoff = decodeURIComponent(usage!.url.split("created_at=lt.")[1]);
    const ageDays = (Date.now() - new Date(cutoff).getTime()) / 86_400_000;
    assert.ok(ageDays > 29 && ageDays < 31, `cutoff ~30d ago, got ${ageDays}`);
  },
));

test("exportUserData gathers every per-user table, scoped to the owner", withFetch(
  (url) => (url.includes("/users?") ? [{ google_sub: "user-7", email: "u@e.com" }] : []),
  async (calls) => {
    const data = await exportUserData("user-7");
    assert.ok(data, "export returned");
    // Shape includes each personal-data surface.
    for (const key of ["account", "usage", "product_events", "published_sites", "outcome_states"]) {
      assert.ok(key in (data as any), `export includes ${key}`);
    }
    assert.equal((data as any).account.google_sub, "user-7");
    // Every read is a GET scoped by the owner id — no cross-account leakage.
    const reads = calls.filter((c) => c.method === "GET");
    assert.equal(reads.length, 5);
    for (const c of reads) assert.match(c.url, /eq\.user-7/);
  },
));

test("privacy helpers refuse to act on an empty account id", async () => {
  assert.equal(await deleteUserData(""), false);
  assert.equal(await exportUserData(""), null);
});
