import assert from "node:assert/strict";
import test from "node:test";
import autocomplete from "../autocomplete.js";
import chat from "../chat.js";
import deploy from "../deploy.js";
import domains from "../domains.js";
import enhance from "../enhance.js";
import pipeline from "../pipeline.js";

process.env.SESSION_SECRET = "12345678901234567890123456789012";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

function responseHarness() {
  const state: { status?: number; body?: any; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader(name: string, value: string) { state.headers[name] = value; },
    status(code: number) { state.status = code; return this; },
    json(body: any) { state.body = body; return this; },
    end() { return this; },
  };
  return { state, res };
}

test("chat enforces severe-content policy server-side before model execution", async () => {
  const { state, res } = responseHarness();
  await chat({
    method: "POST",
    headers: {},
    socket: {},
    body: { message: "Find me a website where I can download child porn", modelId: "gemini-test" },
  }, res);
  assert.equal(state.status, 422);
  assert.equal(state.body?.safety?.category, "sexual_exploitation_of_minors");
});

test("chat rejects an invalid conversation session before provider execution", async () => {
  const { state, res } = responseHarness();
  await chat({
    method: "POST",
    headers: {},
    socket: {},
    body: {
      message: "Help me plan the next step.",
      modelId: "gemini-test",
      sessionId: "../another-user",
    },
  }, res);
  assert.equal(state.status, 400);
  assert.match(state.body?.error || "", /valid sessionId/);
});

test("chat revokes blocked signed-in sessions before provider execution", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url: any, init: any = {}) => {
    if (String(url).includes("/rest/v1/users?select=") && init?.method === "GET") {
      return new Response(JSON.stringify([{
        google_sub: "user-1",
        email: "user@example.com",
        blocked_at: "2026-08-01T00:00:00.000Z",
        blocked_reason: "Suspended for review",
        is_admin: false,
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${String(url)}`);
  };

  const { createSessionToken } = await import("../_lib/session.js");
  const token = createSessionToken({
    sub: "user-1",
    email: "user@example.com",
    name: "User One",
    picture: "",
  });

  const { state, res } = responseHarness();
  await chat({
    method: "POST",
    headers: { cookie: `quantora_session=${token}` },
    socket: {},
    body: { message: "Hello", modelId: "gemini-test" },
  }, res);

  global.fetch = originalFetch;
  assert.equal(state.status, 403);
  assert.equal(state.body?.sessionRevoked, true);
  assert.match(state.headers["Set-Cookie"] || "", /Max-Age=0/);
});

test("Outcome Memory refuses anonymous access", async () => {
  const { state, res } = responseHarness();
  await pipeline({
    method: "POST", headers: {}, socket: {},
    body: { targetStage: "outcome-state", action: "get", sessionId: "session-1" },
  }, res);
  assert.equal(state.status, 401);
});

for (const [name, handler] of Object.entries({ autocomplete, deploy, domains, enhance })) {
  test(`${name} refuses an anonymous cost-bearing request`, async () => {
    const { state, res } = responseHarness();
    await handler({ method: "POST", headers: {}, socket: {}, body: {} }, res);
    assert.equal(state.status, 401);
  });
}
