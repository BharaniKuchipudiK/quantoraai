import assert from "node:assert/strict";
import test from "node:test";

// Must be set before importing store.ts so config() sees a configured store.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

const {
  exportUserData, deleteUserData, purgeOldTelemetry,
  recordSuggestionEvent, getSuggestionAcceptance,
} = await import("./store.js");

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
    const suggestions = calls.find((c) => c.url.includes("/rest/v1/suggestion_events?"));
    assert.ok(usage && events && suggestions, "all three telemetry tables purged");
    for (const c of [usage!, events!, suggestions!]) {
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
    for (const key of ["account", "usage", "product_events", "published_sites", "outcome_states", "desk_checkpoints"]) {
      assert.ok(key in (data as any), `export includes ${key}`);
    }
    assert.equal((data as any).account.google_sub, "user-7");
    /*
     * desk_checkpoints holds the person's actual source, which makes it the one
     * surface here whose omission a person would most obviously notice. Raised
     * in review of #591, where the export still queried the five tables that
     * existed before it.
     */
    assert.ok(
      calls.some((c) => c.method === "GET" && c.url.includes("desk_checkpoints")),
      "the account download must include the desk's stored source, not just its metadata",
    );
    // Every read is a GET scoped by the owner id — no cross-account leakage.
    const reads = calls.filter((c) => c.method === "GET");
    assert.equal(reads.length, 6, "a new per-user table means a new read here, or the export quietly omits it");
    for (const c of reads) assert.match(c.url, /eq\.user-7/);
  },
));

test("privacy helpers refuse to act on an empty account id", async () => {
  assert.equal(await deleteUserData(""), false);
  assert.equal(await exportUserData(""), null);
});

test("recordSuggestionEvent writes one row to suggestion_events with surface + action", withFetch(
  () => [],
  async (calls) => {
    recordSuggestionEvent({ userSub: "user-9", surface: "inline-continues", action: "accepted" });
    // fire-and-forget: give the un-awaited request a tick to fire
    await new Promise((r) => setTimeout(r, 5));
    const post = calls.find((c) => c.url.includes("/rest/v1/suggestion_events"));
    assert.ok(post, "posted to suggestion_events");
    assert.equal(post!.method, "POST");
  },
));

test("recordSuggestionEvent ignores incomplete input (no surface/action)", withFetch(
  () => [],
  async (calls) => {
    recordSuggestionEvent({ userSub: null, surface: "", action: "shown" });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(calls.length, 0, "no write without a surface");
  },
));

test("getSuggestionAcceptance reads the 7-day acceptance view", withFetch(
  () => [{ surface: "inline-continues", shown: 10, accepted: 4, dismissed: 2, acceptance_rate_pct: 66.7 }],
  async (calls) => {
    const rows = await getSuggestionAcceptance();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].surface, "inline-continues");
    assert.match(calls[0].url, /suggestion_acceptance_7d/);
  },
));
