import assert from "node:assert/strict";
import test from "node:test";
import autocomplete from "../autocomplete.js";
import chat from "./chat-handler.js";
import deploy from "../deploy.js";
import domains from "../domains.js";
import enhance from "../enhance.js";
import generateOffice from "../generate-office.js";
import pipeline from "../pipeline.js";
import studyEvidence from "../study-evidence.js";
import studyAssessment from "../study-assessment.js";
import { clearGatewayCredentialCache } from "./credential-broker.js";

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

async function blockedSessionCookie(sub = "user-1") {
  const originalFetch = global.fetch;
  global.fetch = async (url: any, init: any = {}) => {
    if (String(url).includes("/rest/v1/users?select=") && init?.method === "GET") {
      return new Response(JSON.stringify([{
        google_sub: sub,
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
    sub,
    email: "user@example.com",
    name: "User One",
    picture: "",
  });
  return {
    cookie: `quantora_session=${token}`,
    restore() { global.fetch = originalFetch; },
  };
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
  const blocked = await blockedSessionCookie();
  const { state, res } = responseHarness();
  await chat({
    method: "POST",
    headers: { cookie: blocked.cookie },
    socket: {},
    body: { message: "Hello", modelId: "gemini-test" },
  }, res);
  blocked.restore();
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

test("repository preview refuses anonymous access", async () => {
  const { state, res } = responseHarness();
  await pipeline({
    method: "POST", headers: {}, socket: {},
    body: { targetStage: "repository-preview", repoUrl: "https://github.com/example/repo", task: "summarize" },
  }, res);
  assert.equal(state.status, 401);
});

test("Study evidence refuses anonymous writes", async () => {
  const { state, res } = responseHarness();
  await studyEvidence({
    method: "POST", headers: {}, socket: {},
    body: {
      eventKey: "study.session-1.topic.event-1",
      conceptKey: "session.topic",
      conceptLabel: "Topic",
      sessionId: "session-1",
      kind: "self_confidence",
      selfConfidence: 1,
    },
  }, res);
  assert.equal(state.status, 401);
  assert.equal(state.body?.requiresAuth, true);
});

test("Study assessment refuses anonymous issue and grade requests", async () => {
  for (const body of [
    { action: "issue", conceptKey: "physics.kinematics.motion-graphs", conceptLabel: "Motion graphs", sessionId: "session-1" },
    { action: "grade", attemptId: "11111111-1111-4111-8111-111111111111", optionId: "a" },
  ]) {
    const { state, res } = responseHarness();
    await studyAssessment({ method: "POST", headers: {}, socket: {}, body }, res);
    assert.equal(state.status, 401);
    assert.equal(state.body?.requiresAuth, true);
  }
});

test("github create-pr refuses anonymous access", async () => {
  const { state, res } = responseHarness();
  await pipeline({
    method: "POST", headers: {}, socket: {},
    body: {
      targetStage: "github-create-pr",
      repoUrl: "https://github.com/example/repo",
      title: "Desk",
      head: "quantora-desk",
    },
  }, res);
  assert.equal(state.status, 401);
});

test("github preview query alias injects repository-preview without body targetStage", async () => {
  const { state, res } = responseHarness();
  await pipeline({
    method: "POST",
    headers: {},
    socket: {},
    query: { github: "preview" },
    body: { repoUrl: "https://github.com/example/repo" },
  }, res);
  assert.equal(state.status, 401);
});

test("github create-pr revokes blocked signed-in sessions", async () => {
  const blocked = await blockedSessionCookie("blocked-github");
  const { state, res } = responseHarness();
  await pipeline({
    method: "POST",
    headers: { cookie: blocked.cookie },
    socket: {},
    body: {
      targetStage: "github-create-pr",
      repoUrl: "https://github.com/example/repo",
      title: "Desk",
      head: "quantora-desk",
    },
  }, res);
  blocked.restore();
  assert.equal(state.status, 403);
  assert.equal(state.body?.sessionRevoked, true);
});

test("repository-preview revokes blocked signed-in sessions", async () => {
  const blocked = await blockedSessionCookie("blocked-preview");
  const { state, res } = responseHarness();
  await pipeline({
    method: "POST",
    headers: { cookie: blocked.cookie },
    socket: {},
    body: { targetStage: "repository-preview", repoUrl: "https://github.com/example/repo", task: "summarize" },
  }, res);
  blocked.restore();
  assert.equal(state.status, 403);
  assert.equal(state.body?.sessionRevoked, true);
});

test("legacy pipeline model stages revoke blocked signed-in sessions", async () => {
  const blocked = await blockedSessionCookie("blocked-pipeline");
  const { state, res } = responseHarness();
  await pipeline({
    method: "POST",
    headers: { cookie: blocked.cookie },
    socket: {},
    body: { targetStage: "idea", node: { dreamText: "A landing page" } },
  }, res);
  blocked.restore();
  assert.equal(state.status, 403);
  assert.equal(state.body?.sessionRevoked, true);
});

test("Office generation refuses anonymous server-key usage", async () => {
  const saved = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openRouter: process.env.OPENROUTER_API_KEY,
  };
  process.env.ANTHROPIC_API_KEY = "sk-server-anthropic";
  process.env.GEMINI_API_KEY = "sk-server-gemini";
  process.env.OPENROUTER_API_KEY = "sk-server-openrouter";

  const { state, res } = responseHarness();
  await generateOffice({
    method: "POST",
    headers: {},
    socket: {},
    body: {
      format: "word",
      operation: "create",
      prompt: "Write a one-page brief about reliability.",
    },
  }, res);

  if (saved.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved.anthropic;
  if (saved.gemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = saved.gemini;
  if (saved.openRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = saved.openRouter;

  assert.equal(state.status, 401);
  assert.equal(state.body?.requiresAuth, true);
});

test("Office generation revokes blocked signed-in sessions before using server keys", async () => {
  const blocked = await blockedSessionCookie("blocked-office");
  const savedGemini = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "sk-server-gemini";

  const { state, res } = responseHarness();
  await generateOffice({
    method: "POST",
    headers: { cookie: blocked.cookie },
    socket: {},
    body: {
      format: "word",
      operation: "create",
      prompt: "Write a one-page brief about reliability.",
    },
  }, res);

  blocked.restore();
  if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGemini;

  assert.equal(state.status, 403);
  assert.equal(state.body?.sessionRevoked, true);
});

test("Office generation lets the golden canary use server keys, as chat does", async () => {
  const savedToken = process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
  const savedGemini = process.env.GEMINI_API_KEY;
  process.env.QUANTORA_GOLDEN_CANARY_TOKEN = "golden-canary-token-for-the-office-test-0001";
  process.env.GEMINI_API_KEY = "sk-server-gemini";
  const originalFetch = global.fetch;
  const reached: string[] = [];
  // Supabase answers empty (no stored canary user, nothing rate-limited);
  // every provider is offline, so the turn cannot succeed — the question is
  // only whether the canary got PAST the sign-in refusal to a provider at all.
  global.fetch = async (url: any) => {
    reached.push(String(url));
    if (String(url).startsWith(String(process.env.SUPABASE_URL))) {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error("offline: no provider is reachable in this test");
  };

  const { state, res } = responseHarness();
  try {
    await generateOffice({
      method: "POST",
      headers: { "x-quantora-golden-canary": "golden-canary-token-for-the-office-test-0001" },
      socket: {},
      body: {
        format: "word",
        operation: "create",
        prompt: "Write a one-page brief about reliability.",
      },
    }, res);
  } finally {
    global.fetch = originalFetch;
    if (savedToken === undefined) delete process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
    else process.env.QUANTORA_GOLDEN_CANARY_TOKEN = savedToken;
    if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedGemini;
  }

  assert.notEqual(state.status, 401, `the canary was refused as anonymous: ${JSON.stringify(state.body)}`);
  assert.notEqual(state.body?.requiresAuth, true);
  assert.ok(
    reached.some((url) => !url.startsWith(String(process.env.SUPABASE_URL))),
    `the handler never reached a provider — the canary did not get server keys (status ${state.status}: ${JSON.stringify(state.body)})`,
  );
});

test("Office generation resolves Gemini through the gateway when the environment holds no key, as chat does", async () => {
  const saved = {
    token: process.env.QUANTORA_GOLDEN_CANARY_TOKEN,
    gemini: process.env.GEMINI_API_KEY,
    openRouter: process.env.OPENROUTER_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };
  process.env.QUANTORA_GOLDEN_CANARY_TOKEN = "golden-canary-token-for-the-office-test-0002";
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  clearGatewayCredentialCache();
  const originalFetch = global.fetch;
  const reached: string[] = [];
  const gatewayReads: string[] = [];
  // The pull-request previews of 2026-09-06: no model key in the environment,
  // Gemini's in the Supabase gateway. Chat ran on it; the Office generator
  // never asked, and failed its Word file with no Gemini at all.
  global.fetch = async (url: any) => {
    const target = String(url);
    reached.push(target);
    if (target.startsWith(String(process.env.SUPABASE_URL))) {
      if (target.includes("/rest/v1/api_gateway_keys?")) {
        gatewayReads.push(target);
        const rows = target.includes("provider=eq.GEMINI") ? [{ api_key: "gateway-held-gemini-key" }] : [];
        return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error("offline: no provider is reachable in this test");
  };

  const { state, res } = responseHarness();
  try {
    await generateOffice({
      method: "POST",
      headers: { "x-quantora-golden-canary": "golden-canary-token-for-the-office-test-0002" },
      socket: {},
      body: {
        format: "word",
        operation: "create",
        prompt: "Write a one-page brief about reliability.",
      },
    }, res);
  } finally {
    global.fetch = originalFetch;
    clearGatewayCredentialCache();
    if (saved.token === undefined) delete process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
    else process.env.QUANTORA_GOLDEN_CANARY_TOKEN = saved.token;
    for (const [name, value] of [["GEMINI_API_KEY", saved.gemini], ["OPENROUTER_API_KEY", saved.openRouter], ["ANTHROPIC_API_KEY", saved.anthropic]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  assert.ok(
    gatewayReads.some((target) => target.includes("provider=eq.GEMINI")),
    `the handler never asked the gateway for Gemini: ${gatewayReads.join(", ") || "no gateway read at all"}`,
  );
  assert.notEqual(state.status, 401, `with no key in the environment the handler refused instead of using the gateway's Gemini: ${JSON.stringify(state.body)}`);
  assert.ok(
    reached.some((target) => target.includes("generativelanguage.googleapis.com")),
    `the gateway's Gemini key never reached Gemini (status ${state.status}: ${JSON.stringify(state.body)})`,
  );
  // And the failure names the provider it asked, not only its headline.
  assert.equal(state.status, 502, JSON.stringify(state.body));
  assert.equal(state.body?.stage, "provider");
  assert.match(String(state.body?.detail || ""), /^gemini: /);
});

test("chat ignores BYOK keys placed in the JSON body", async () => {
  const { state, res } = responseHarness();
  await chat({
    method: "POST",
    headers: {},
    socket: {},
    body: {
      message: "Hello with a body key that must be ignored",
      modelId: "gemini-test",
      userKey: "sk-body-gemini",
      openRouterKey: "sk-body-openrouter",
    },
  }, res);
  assert.equal(state.status, 401);
  assert.equal(state.body?.requiresAuth, true);
});

for (const [name, handler] of Object.entries({ autocomplete, deploy, domains, enhance })) {
  test(`${name} refuses an anonymous cost-bearing request`, async () => {
    const { state, res } = responseHarness();
    await handler({ method: "POST", headers: {}, socket: {}, body: {} }, res);
    assert.equal(state.status, 401);
  });
}
