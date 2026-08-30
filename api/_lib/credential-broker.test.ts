import assert from "node:assert/strict";
import test from "node:test";

import { fetchGatewayCredential, clearGatewayCredentialCache } from "./credential-broker.js";

const DEPS = { supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role" };

function respond(status: number, body: unknown): any {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}
function boom(): any {
  return async () => { throw new Error("network down"); };
}

test("reads a credential and caches it", async () => {
  clearGatewayCredentialCache();
  const key = await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, [{ api_key: "gem-key" }]) });
  assert.equal(key, "gem-key");
});

test("a transient backend failure serves the last-known-good key, not null", async () => {
  // This is the "no healthy AI route" bug: one failed lookup used to report the
  // gateway as credential-less and strand a signed-in user mid-conversation.
  clearGatewayCredentialCache();
  await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, [{ api_key: "gem-key" }]) });
  assert.equal(await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: boom() }), "gem-key");
  assert.equal(await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(503, {}) }), "gem-key");
});

test("a clear 4xx or an empty row drains the cache — a revoked key must not linger", async () => {
  clearGatewayCredentialCache();
  await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, [{ api_key: "gem-key" }]) });
  assert.equal(await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(401, {}) }), null);
  assert.equal(await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: boom() }), null, "nothing cached to fall back on");

  clearGatewayCredentialCache();
  await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, [{ api_key: "gem-key" }]) });
  assert.equal(await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, []) }), null);
});

test("the cached key expires so a rotated credential drains out", async () => {
  clearGatewayCredentialCache();
  const t0 = 1_000_000;
  await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, [{ api_key: "gem-key" }]), now: t0 });
  assert.equal(await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: boom(), now: t0 + 60_000 }), "gem-key");
  assert.equal(await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: boom(), now: t0 + 11 * 60_000 }), null);
});

test("an unconfigured deployment never serves a cached key", async () => {
  clearGatewayCredentialCache();
  await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, [{ api_key: "gem-key" }]) });
  const unconfigured = await fetchGatewayCredential("GEMINI", { supabaseUrl: null, serviceRoleKey: null, fetchFn: boom() });
  assert.equal(unconfigured, null);
});

test("credentials are cached per provider, never shared", async () => {
  clearGatewayCredentialCache();
  await fetchGatewayCredential("GEMINI", { ...DEPS, fetchFn: respond(200, [{ api_key: "gem-key" }]) });
  assert.equal(await fetchGatewayCredential("OPENROUTER", { ...DEPS, fetchFn: boom() }), null);
});
