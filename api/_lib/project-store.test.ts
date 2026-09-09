import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProject } from './project-store.js';

const project = { id: 'private-project-id', version: 2, name: 'private name', description: 'private description', goal: 'private goal', status: 'active' as const, color: null };

function interruptedResponse(status: number) {
  return new Response(new ReadableStream({
    start(controller) { controller.error(new DOMException('private name', 'TimeoutError')); },
  }), { status });
}

test('project save diagnostics distinguish outcomes without logging user data or retrying writes', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.warn = originalWarn;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
  process.env.SUPABASE_URL = 'https://private-host.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-service-key';
  const row = { ...project, created_at: null, updated_at: null };
  const cases = [
    { name: 'saved', response: () => new Response(JSON.stringify([row])), status: 'saved', phase: 'complete', failure: null, httpStatus: 200 },
    { name: 'conflict', response: () => new Response(JSON.stringify({ code: '40001', message: 'project_version_conflict' }), { status: 400 }), status: 'conflict', phase: 'complete', failure: null, httpStatus: 400 },
    { name: 'database rejection', response: () => new Response(JSON.stringify({ code: '23503', message: 'private name private description private-owner' }), { status: 400 }), status: 'unavailable', phase: 'complete', failure: null, httpStatus: 400 },
    { name: 'headers timeout', response: () => { throw new DOMException('private-host', 'TimeoutError'); }, status: 'unavailable', phase: 'headers', failure: 'timeout', httpStatus: null },
    { name: 'network failure', response: () => { throw new TypeError('private-service-key'); }, status: 'unavailable', phase: 'headers', failure: 'transport', httpStatus: null },
    { name: 'error body interruption', response: () => interruptedResponse(503), status: 'unavailable', phase: 'body', failure: 'timeout', httpStatus: 503 },
    { name: 'success body interruption', response: () => interruptedResponse(200), status: 'unavailable', phase: 'body', failure: 'timeout', httpStatus: 200 },
    { name: 'malformed body', response: () => new Response('{'), status: 'unavailable', phase: 'body', failure: 'decode', httpStatus: 200 },
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => {
    const logs: unknown[][] = [];
    console.info = (...args: unknown[]) => { logs.push(args); };
    console.warn = (...args: unknown[]) => { logs.push(args); };
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls++;
      assert.equal(init?.method, 'POST');
      assert.ok(init?.signal);
      return scenario.response();
    };
    const result = await saveProject({ userSub: 'private-owner', expectedVersion: 2, project });
    assert.equal(result.status, scenario.status);
    assert.equal(calls, 1, 'an unknown commit outcome must not replay the write');
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], '[project-save]');
    const event = logs[0][1] as Record<string, unknown>;
    assert.equal(event.outcome, scenario.status);
    assert.equal(event.phase, scenario.phase);
    assert.equal(event.failure, scenario.failure);
    assert.equal(event.httpStatus, scenario.httpStatus);
    assert.equal(event.budgetMs, 4000);
    assert.ok(typeof event.elapsedMs === 'number' && event.elapsedMs >= 0);
    assert.equal(event.headersMs === null, scenario.httpStatus === null);
    assert.doesNotMatch(JSON.stringify(logs), /private-/);
    assert.doesNotMatch(JSON.stringify(logs), /private name|private description|private goal/);
  });
});
