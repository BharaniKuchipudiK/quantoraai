import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserPilotRunAllowed,
  browserPilotRunIdForSlot,
  browserPilotScope,
  browserSubmissionRun,
  validBrowserSubmission,
} from './qir-browser-pilot.js';
import { handleBrowserPilotRequest } from './qir-browser-pilot-api.js';
import { browserPilotAllows } from '../../services/qir-workflow/transition.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';

const env = {
  QIR_BROWSER_PILOT_ENABLED: 'true',
  QIR_BROWSER_PILOT_DYNAMIC_RUNS: 'true',
  QIR_BROWSER_PILOT_USER_SUB: 'pilot-user',
  QIR_BROWSER_PILOT_SESSION_ID: 'pilot-desk',
  QIR_BROWSER_PILOT_RUN_ID: '',
  QIR_BROWSER_PILOT_WORKER_URL: 'https://quantora-coding-worker-pilot.vercel.app',
  QIR_BROWSER_PILOT_WORKER_TOKEN: 'synthetic-test-secret',
  QIR_WORKFLOW_PILOT_ENABLED: 'true',
  QIR_AI_GATEWAY_API_KEY: 'synthetic',
  QIR_WORKER_MODEL: 'test/model',
  QIR_GATEWAY_MODELS: 'test/model',
};

const vfs = { 'index.html': '<html>Saved</html>' };
const workspaceHash = hashVfsContent(vfs);

function configure(t: any) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value as string;
    }
  });
}

function capture() {
  return {
    code: 0,
    data: null as any,
    headers: {} as Record<string, string>,
    status(code: number) { this.code = code; return this; },
    json(data: any) { this.data = data; return this; },
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; },
  };
}

function slotCookie(setCookie: string): string {
  return String(setCookie || '').split(';')[0] || '';
}

test('dynamic browser rollout stays pinned to the approved account and desk', () => {
  const scope = browserPilotScope('pilot-user', 'pilot-desk', env);
  assert.equal(scope?.dynamicRuns, true);
  assert.equal(scope?.runId, '');
  assert.equal(browserPilotScope('other-user', 'pilot-desk', env), null);
  assert.equal(browserPilotScope('pilot-user', 'other-desk', env), null);

  const first = browserPilotRunIdForSlot('pilot-user', 'pilot-desk', '11111111-1111-4111-8111-111111111111');
  const retry = browserPilotRunIdForSlot('pilot-user', 'pilot-desk', '11111111-1111-4111-8111-111111111111');
  const next = browserPilotRunIdForSlot('pilot-user', 'pilot-desk', '22222222-2222-4222-8222-222222222222');
  assert.equal(first, retry);
  assert.notEqual(first, next);
  assert.equal(browserPilotRunAllowed(scope, first), true);
  assert.equal(browserPilotRunAllowed(scope, 'pilot-run'), false);
  assert.equal(validBrowserSubmission({
    userSub: 'pilot-user', sessionId: 'pilot-desk', runId: first,
    goal: 'Build a responsive website', workspaceHash,
  }, env), true);
  assert.equal(browserPilotAllows('pilot-user', 'pilot-desk', first, env), true);
});

test('capability reconnect preserves the same identity even after the run becomes terminal', async (t) => {
  configure(t);
  const ports = {
    read: async () => { throw new Error('capability discovery must not rotate from journal state'); },
    load: async () => { throw new Error('unused'); },
    fetch: async () => { throw new Error('unused'); },
  } as any;

  const first = capture();
  await handleBrowserPilotRequest(
    { method: 'GET', query: { workerPilot: '1', sessionId: 'pilot-desk' }, headers: {} },
    first, 'pilot-user', ports,
  );
  assert.equal(first.code, 200);
  const cookie = slotCookie(first.headers['set-cookie']);
  const firstRunId = first.data.runId;

  const reopened = capture();
  await handleBrowserPilotRequest(
    { method: 'GET', query: { workerPilot: '1', sessionId: 'pilot-desk' }, headers: { cookie } },
    reopened, 'pilot-user', ports,
  );
  assert.equal(reopened.data.runId, firstRunId);
  assert.equal(slotCookie(reopened.headers['set-cookie']), cookie);
});

test('a different submission after a terminal run rotates only at the explicit submit boundary', async (t) => {
  configure(t);
  const slot = '22222222-2222-4222-8222-222222222222';
  const cookie = `quantora_qir_browser_slot=${slot}`;
  const oldRunId = browserPilotRunIdForSlot('pilot-user', 'pilot-desk', slot);
  const oldInput = {
    userSub: 'pilot-user', sessionId: 'pilot-desk', runId: oldRunId,
    goal: 'Build the first website', workspaceHash,
  };
  const oldRun = { ...browserSubmissionRun(oldInput), status: 'FAILED_TERMINAL' as const };
  let workerInput: any = null;

  const res = capture();
  await handleBrowserPilotRequest({
    method: 'POST', headers: { cookie }, body: {
      action: 'coding.workflow_submit', sessionId: 'pilot-desk',
      goal: 'Build the second website', workspaceHash,
    },
  }, res, 'pilot-user', {
    read: async (_userSub: string, runId: string) => runId === oldRunId ? { run: oldRun } : null,
    load: async () => ({ status: 'loaded', sessionId: 'pilot-desk', vfs, checkpointCount: 1 }),
    fetch: async (_url: string, options: any) => {
      workerInput = JSON.parse(options.body);
      return new Response(JSON.stringify({ runId: workerInput.runId, workflowRunId: 'wrun_next' }), { status: 202 });
    },
  } as any);

  assert.equal(res.code, 202);
  assert.notEqual(res.data.runId, oldRunId);
  assert.equal(workerInput.runId, res.data.runId);
  assert.notEqual(slotCookie(res.headers['set-cookie']), cookie);
});

test('dynamic submission fails closed without the server-issued slot', async (t) => {
  configure(t);
  const res = capture();
  await handleBrowserPilotRequest({
    method: 'POST', headers: {}, body: {
      action: 'coding.workflow_submit', sessionId: 'pilot-desk',
      goal: 'Build a responsive website', workspaceHash,
    },
  }, res, 'pilot-user', {
    read: async () => { throw new Error('must not read'); },
    load: async () => { throw new Error('must not load'); },
    fetch: async () => { throw new Error('must not schedule'); },
  } as any);
  assert.equal(res.code, 409);
  assert.equal(res.data.reason, 'submission-identity-missing');
});

test('dynamic submission schedules exactly the run identity issued for the slot', async (t) => {
  configure(t);
  const slot = '33333333-3333-4333-8333-333333333333';
  const cookie = `quantora_qir_browser_slot=${slot}`;
  const expectedRunId = browserPilotRunIdForSlot('pilot-user', 'pilot-desk', slot);
  let workerInput: any = null;
  const res = capture();
  await handleBrowserPilotRequest({
    method: 'POST', headers: { cookie }, body: {
      action: 'coding.workflow_submit', sessionId: 'pilot-desk',
      goal: 'Build a responsive website for my tutoring business', workspaceHash,
    },
  }, res, 'pilot-user', {
    read: async () => null,
    load: async () => ({ status: 'loaded', sessionId: 'pilot-desk', vfs, checkpointCount: 1 }),
    fetch: async (_url: string, options: any) => {
      workerInput = JSON.parse(options.body);
      return new Response(JSON.stringify({ runId: expectedRunId, workflowRunId: 'wrun_dynamic' }), { status: 202 });
    },
  } as any);
  assert.equal(res.code, 202);
  assert.equal(res.data.runId, expectedRunId);
  assert.equal(workerInput.runId, expectedRunId);
  assert.equal(workerInput.userSub, 'pilot-user');
  assert.equal(workerInput.sessionId, 'pilot-desk');
  assert.equal(browserPilotAllows('pilot-user', 'pilot-desk', expectedRunId, env), true);
});
