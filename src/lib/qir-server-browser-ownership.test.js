import assert from 'node:assert/strict';
import test from 'node:test';
import { createQirCodingRunClient } from './qir-coding-run-core.js';

function queuedRun() {
  return {
    version: 'qir-contracts-2026-09-02.1',
    runId: 'coding-run-server-1',
    goal: { statement: 'Change the heading', status: 'confirmed' },
    status: 'QUEUED',
    steps: [],
    cursor: { stepId: null, actionId: null, attempt: 0 },
    artifacts: [], observations: [], verifications: [], checkpoints: [],
    budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
  };
}

function executingRun() {
  const run = queuedRun();
  return {
    ...run,
    status: 'EXECUTING',
    steps: [{
      stepId: 'coding-model-1', taskId: 'coding.model', objective: run.goal.statement,
      dependsOn: [], status: 'active', requiresVerification: true, actionId: 'coding-model-action-1',
    }],
    cursor: { stepId: 'coding-model-1', actionId: 'coding-model-action-1', attempt: 0 },
    updatedAt: '2026-09-12T00:00:01.000Z',
  };
}

test('a different follow-up creates a fresh Run in the same desk and repeated submission does not duplicate it', async () => {
  const originalFetch = globalThis.fetch;
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let pointer = 'prior-run';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => pointer, setItem: (_key, value) => { pointer = value; },
  } });
  const calls = [];
  let snapshot = { ...queuedRun(), runId: pointer, status: 'COMPLETE' };
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (body?.run) snapshot = body.run;
    if (body?.action === 'coding.attempt') snapshot = { ...snapshot, status: 'EXECUTING' };
    return { ok: true, status: 200, json: async () => ({ run: snapshot }) };
  };
  try {
    const errors = [];
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: error => errors.push(error),
      readOptions: () => ({ enabled: true, sessionId: 'same-desk', goal: 'Change the heading', vfs: {} }),
    });
    const result = await client.submitServerRun('Add a filter');
    assert.equal(result.status, 'EXECUTING');
    assert.notEqual(result.runId, 'prior-run');
    assert.equal(result.goal.statement, 'Add a filter');
    const context = calls.find(call => call.url === '/api/qir-context');
    assert.equal(context.body.projectState.sessionId, 'same-desk');
    assert.equal(context.body.projectState.goal, 'Add a filter');
    await client.submitServerRun('Add a filter');
    assert.equal(calls.filter(call => call.body?.run).length, 1);
    assert.equal(calls.filter(call => call.body?.action === 'coding.attempt').length, 1);
    assert.deepEqual(errors, []);
    const rejected = await client.submitServerRun('Delete the table');
    assert.equal(rejected, null);
    assert.equal(errors[0].reason, 'coding-run-active');
    assert.equal(calls.filter(call => call.body?.run).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
  }
});

test('switching desks during follow-up creation cannot bind or start the old submission in the new desk', async () => {
  const originalFetch = globalThis.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const writes = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => 'prior-run', setItem: (...args) => writes.push(args),
  } });
  let sessionId = 'desk-a';
  const calls = [];
  const accepted = [];
  const errors = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (body?.run) sessionId = 'desk-b';
    return { ok: true, status: 200, json: async () => ({
      run: body?.run || { ...queuedRun(), status: 'COMPLETE' },
    }) };
  };
  try {
    const client = createQirCodingRunClient({
      onRun: run => accepted.push(run), onError: error => errors.push(error),
      readOptions: () => ({ enabled: true, sessionId, vfs: {} }),
    });
    assert.equal(await client.submitServerRun('Add a filter'), null);
    assert.equal(errors[0].reason, 'coding-session-changed');
    assert.deepEqual(writes, []);
    assert.equal(accepted.length, 1, 'only the original desk snapshot may be accepted');
    assert.equal(calls.some(call => call.url === '/api/qir-context'), false);
    assert.equal(calls.some(call => call.body?.action === 'coding.attempt'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('server-owned submit binds the desk session before making coding.model runnable', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let snapshot = queuedRun();
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, method: init.method || 'GET' });

    if (String(url) === '/api/qir-context') {
      assert.equal(body.runId, snapshot.runId);
      assert.equal(body.projectState.sessionId, 'desk-session-1');
      assert.deepEqual(body.projectState.files, ['App.jsx']);
      return { ok: true, status: 200, json: async () => ({ run: snapshot, context: { hash: 'context-1' } }) };
    }
    if (body?.action === 'coding.attempt') {
      snapshot = executingRun();
      return { ok: true, status: 200, json: async () => ({ run: snapshot }) };
    }
    if (body?.run) {
      snapshot = { ...body.run, runId: 'coding-run-server-1' };
      return { ok: true, status: 200, json: async () => ({ run: snapshot }) };
    }
    return { ok: true, status: 200, json: async () => ({ run: snapshot }) };
  };

  try {
    const errors = [];
    const client = createQirCodingRunClient({
      onRun: () => {},
      onError: (error) => errors.push(error),
      readOptions: () => ({
        enabled: true,
        sessionId: 'desk-session-1',
        goal: 'Change the heading',
        vfs: { 'App.jsx': 'export default function App(){ return <h1>Old</h1> }' },
        job: { title: 'Change heading' },
      }),
    });

    const result = await client.submitServerRun('Change the heading', 'server-auto');
    assert.equal(result.status, 'EXECUTING');
    assert.deepEqual(errors, []);

    const contextIndex = calls.findIndex((call) => call.url === '/api/qir-context');
    const attemptIndex = calls.findIndex((call) => call.body?.action === 'coding.attempt');
    assert.ok(contextIndex >= 0, 'the worker needs a durable desk-session binding');
    assert.ok(attemptIndex > contextIndex, 'the Run must not become runnable before its desk context is durable');
    assert.equal(calls.filter((call) => call.body?.action === 'coding.start').length, 0, 'server-owned submit must not attach browser artifact bytes');
    assert.equal(calls.filter((call) => call.body?.action === 'coding.recover').length, 0, 'server-owned submit must not start browser recovery');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('server-owned submit refuses to create a second execution owner when context binding fails', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let snapshot = queuedRun();
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url) === '/api/qir-context') {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: 'QIR storage is not configured.', reason: 'storage-unconfigured' }),
      };
    }
    if (body?.run) {
      snapshot = { ...body.run, runId: 'coding-run-server-1' };
      return { ok: true, status: 200, json: async () => ({ run: snapshot }) };
    }
    return { ok: true, status: 200, json: async () => ({ run: snapshot }) };
  };

  try {
    const errors = [];
    const client = createQirCodingRunClient({
      onRun: () => {},
      onError: (error) => errors.push(error),
      readOptions: () => ({ enabled: true, sessionId: 'desk-session-1', goal: 'Build', vfs: {} }),
    });
    const result = await client.submitServerRun('Build', 'server-auto');
    assert.equal(result, null, 'submission must fail closed when the worker cannot recover desk context');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].reason, 'storage-unconfigured');
    assert.equal(calls.some((call) => call.body?.action === 'coding.attempt'), false, 'no runnable server action may exist without its durable context');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser observation refreshes durable Run state without executing another action', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const complete = {
    ...executingRun(),
    status: 'COMPLETE',
    goal: { statement: 'Change the heading', status: 'achieved' },
    steps: [{ ...executingRun().steps[0], status: 'verified' }],
    artifacts: [{
      artifactId: 'coding-desk-vfs', generation: 1, ref: 'desk-checkpoint://desk-session-1/qir-action-1',
      state: 'verified', createdByActionId: 'coding-model-action-1', verifiedByActionId: 'qir-independent-verifier-1',
    }],
  };
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, method: init.method || 'GET' });
    if (body?.run) return { ok: true, status: 200, json: async () => ({ run: body.run }) };
    return { ok: true, status: 200, json: async () => ({ run: complete }) };
  };

  try {
    const client = createQirCodingRunClient({
      onRun: () => {}, onError: () => {},
      readOptions: () => ({ enabled: true, sessionId: 'desk-session-1', goal: 'Change the heading', vfs: {} }),
    });
    const observed = await client.refresh();
    assert.equal(observed.status, 'COMPLETE');
    assert.equal(calls.some((call) => call.body?.action), false, 'refresh is observation only');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
