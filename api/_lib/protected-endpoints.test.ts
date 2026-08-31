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
