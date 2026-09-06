import assert from 'node:assert/strict';
import test from 'node:test';
import { describeTurnPlans, summarizeTurnPlans } from './turn-plan-ledger.js';
import planTurn from './handlers/plan-turn.js';

/*
 * PHASE 7, SECOND CUT — the planner is measured.
 *
 * A decision that is not measured cannot be promoted or demoted on evidence.
 * The summary is arithmetic over rows, so it is tested without a store; the
 * handler test proves the wiring — a plan that is made is a plan that is
 * recorded — with the store's HTTP captured and every provider offline.
 */

const row = (over: Record<string, unknown> = {}) => ({
  lane: 'build', source: 'planner', agreed: true, confidence: 0.9, deterministic_lane: 'build',
  planner_ms: 1200, planner_error: null, created_at: '2026-09-06T12:00:00.000Z', ...over,
});

test('an empty window is zero turns and null rates — never a perfect planner', () => {
  const summary = summarizeTurnPlans([]);
  assert.equal(summary.turns, 0);
  assert.equal(summary.plannerRate, null);
  assert.equal(summary.agreedRate, null);
  assert.equal(summary.medianPlannerMs, null);
  assert.deepEqual(summary.lanes, { build: 0, office: 0, advisor: 0, chat: 0 });
  assert.match(describeTurnPlans(summary, 'no-rows'), /no plans recorded .* apply migration 20260906170000/);
  assert.match(describeTurnPlans(summary, 'not_configured'), /store is not configured/);
});

test('the summary counts lanes, the planner\'s share, its agreement with the rules, where it overruled them, and its median latency', () => {
  const rows = [
    row(),
    row({ lane: 'build', deterministic_lane: 'office', agreed: false, planner_ms: 2400 }),
    row({ lane: 'build', deterministic_lane: 'office', agreed: false, planner_ms: 900 }),
    row({ lane: 'advisor', deterministic_lane: 'chat', agreed: false, planner_ms: 1500 }),
    row({ lane: 'chat', source: 'fallback', agreed: false, planner_ms: 6000, planner_error: 'turn planner exceeded 6000ms' }),
    row({ lane: 'office', deterministic_lane: 'office', agreed: true, planner_ms: 700 }),
  ];
  const summary = summarizeTurnPlans(rows);
  assert.equal(summary.turns, 6);
  assert.equal(summary.planner, 5);
  assert.equal(summary.fallback, 1);
  assert.equal(summary.plannerRate, 83);
  // Agreement is measured on the planner's turns only: 2 of 5.
  assert.equal(summary.agreedRate, 40);
  assert.deepEqual(summary.lanes, { build: 3, office: 1, advisor: 1, chat: 1 });
  assert.deepEqual(summary.disagreements, [
    { from: 'office', to: 'build', count: 2 },
    { from: 'chat', to: 'advisor', count: 1 },
  ]);
  // Median of the planner's latencies (700, 900, 1200, 1500, 2400); the fallback's 6000 is not the planner's time.
  assert.equal(summary.medianPlannerMs, 1200);
  assert.equal(summary.errors, 1);
  const line = describeTurnPlans(summary, 'measured');
  assert.match(line, /6 turns · planner decided 83% · agreed with the rules 40% · median 1200 ms · build 3 \/ office 1 \/ advisor 1 \/ chat 1 · planner errors 1 · most overruled: office→build ×2, chat→advisor ×1/);
});

test('a plan that is made is a plan that is recorded: the handler writes the row with the store captured and every provider offline', async () => {
  const saved = {
    token: process.env.QUANTORA_GOLDEN_CANARY_TOKEN,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    gemini: process.env.GEMINI_API_KEY,
    sessionSecret: process.env.SESSION_SECRET,
  };
  process.env.QUANTORA_GOLDEN_CANARY_TOKEN = 'golden-canary-token-for-the-plan-ledger-test-01';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.GEMINI_API_KEY = 'sk-server-gemini';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || '12345678901234567890123456789012';
  const originalFetch = global.fetch;
  const writes: Array<{ url: string; body: any }> = [];
  global.fetch = async (url: any, init: any = {}) => {
    const target = String(url);
    if (target.startsWith('https://example.supabase.co')) {
      if (init?.method === 'POST' && target.includes('/rest/v1/turn_plan_events')) {
        writes.push({ url: target, body: JSON.parse(String(init.body || '[]')) });
        return new Response('', { status: 201 });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`offline: ${target}`);
  };
  const state: { status?: number; body?: any } = {};
  const res = {
    setHeader() {},
    status(code: number) { state.status = code; return this; },
    json(body: any) { state.body = body; return this; },
    end() { return this; },
  };
  try {
    await planTurn({
      method: 'POST',
      headers: { 'x-quantora-golden-canary': 'golden-canary-token-for-the-plan-ledger-test-01' },
      socket: {},
      body: { message: 'Build me a website for my bakery with a menu page and a contact form.', attachments: [], history: [], pinnedDesk: null, codingDeskOpen: false, hasDeskFiles: false },
    }, res);
    // The recorder is fire-and-forget; give its promise a tick.
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      QUANTORA_GOLDEN_CANARY_TOKEN: saved.token, SUPABASE_URL: saved.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: saved.supabaseKey,
      GEMINI_API_KEY: saved.gemini, SESSION_SECRET: saved.sessionSecret,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  assert.equal(state.status, 200, `the planner did not answer 200: ${JSON.stringify(state.body)}`);
  assert.equal(state.body?.plan?.source, 'fallback', 'with every provider offline the deterministic plan is the plan');
  assert.equal(writes.length, 1, 'exactly one turn_plan_events row is written per plan');
  const written = writes[0].body[0];
  assert.equal(written.lane, 'build');
  assert.equal(written.source, 'fallback');
  assert.equal(written.deterministic_lane, 'build');
  assert.equal(typeof written.planner_ms, 'number');
  assert.ok(written.planner_error, 'the error class of the offline planner is recorded');
  assert.ok(!JSON.stringify(written).includes('bakery'), 'the row carries no message text');
});
