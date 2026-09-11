import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLocalFileQirWorkerLeaseStore,
  createSupabaseQirWorkerLeaseStore,
} from "./qir-worker-lease.js";

function installFetch(handler: (url: string, init: RequestInit) => Promise<any> | any) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://lease-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  globalThis.fetch = handler as any;
  return () => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  };
}

test("Supabase worker lease adapter maps claim, heartbeat and release to service-role RPCs", async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const restore = installFetch(async (url, init) => {
    const body = JSON.parse(String(init.body || "{}"));
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/claim_qir_worker_lease")) {
      return { ok: true, json: async () => [{ acquired: true, worker_id: "w1", lease_token: "t1", leased_until: "2026-09-12T01:00:30.000Z", heartbeat_at: "2026-09-12T01:00:00.000Z" }] };
    }
    if (String(url).endsWith("/heartbeat_qir_worker_lease")) {
      return { ok: true, json: async () => [{ renewed: true, leased_until: "2026-09-12T01:00:31.000Z", heartbeat_at: "2026-09-12T01:00:01.000Z" }] };
    }
    if (String(url).endsWith("/release_qir_worker_lease")) return { ok: true, json: async () => true };
    throw new Error(`unexpected RPC ${url}`);
  });
  try {
    const lease = createSupabaseQirWorkerLeaseStore();
    const claimed = await lease.claim({ userSub: "u1", runId: "r1", workerId: "w1", leaseToken: "t1", ttlMs: 30_000 });
    assert.equal(claimed.status, "acquired");
    const heartbeat = await lease.heartbeat({ userSub: "u1", runId: "r1", workerId: "w1", leaseToken: "t1", ttlMs: 30_000 });
    assert.equal(heartbeat.status, "renewed");
    const released = await lease.release({ userSub: "u1", runId: "r1", workerId: "w1", leaseToken: "t1" });
    assert.equal(released.status, "released");
    assert.equal(calls.length, 3);
    assert.equal(calls[0].body.p_ttl_seconds, 30);
    assert.equal(calls[0].body.p_worker_id, "w1");
    assert.equal(calls[1].body.p_lease_token, "t1");
  } finally {
    restore();
  }
});

test("local lease refuses a concurrent owner and allows reclaim after expiry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qir-worker-lease-unit-"));
  try {
    const lease = createLocalFileQirWorkerLeaseStore(dir);
    const first = await lease.claim({ userSub: "u", runId: "r", workerId: "a", leaseToken: "ta", ttlMs: 500 });
    assert.equal(first.status, "acquired");
    const blocked = await lease.claim({ userSub: "u", runId: "r", workerId: "b", leaseToken: "tb", ttlMs: 500 });
    assert.equal(blocked.status, "busy");
    await new Promise((resolve) => setTimeout(resolve, 550));
    const reclaimed = await lease.claim({ userSub: "u", runId: "r", workerId: "b", leaseToken: "tb", ttlMs: 500 });
    assert.equal(reclaimed.status, "acquired");
    const oldHeartbeat = await lease.heartbeat({ userSub: "u", runId: "r", workerId: "a", leaseToken: "ta", ttlMs: 500 });
    assert.equal(oldHeartbeat.status, "lost", "the expired old owner cannot resurrect its lease");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
