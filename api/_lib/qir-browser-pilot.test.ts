import test from 'node:test';
import assert from 'node:assert/strict';
import { browserSubmissionRun, validBrowserSubmission } from './qir-browser-pilot.js';
import { handleBrowserPilotRequest } from './qir-browser-pilot-api.js';
import { initializeBrowserSubmission } from '../../services/qir-workflow/submission.js';
import { browserPilotAllows } from '../../services/qir-workflow/transition.js';
import { isValidQirRunSnapshot } from './qir-run-store.js';
import { createQirServerCodingExecutor } from './qir-server-coding-executor.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';

const env = {
  QIR_BROWSER_PILOT_ENABLED: 'true', QIR_BROWSER_PILOT_USER_SUB: 'pilot-user', QIR_BROWSER_PILOT_SESSION_ID: 'pilot-desk', QIR_BROWSER_PILOT_RUN_ID: 'pilot-run',
  QIR_BROWSER_PILOT_WORKER_URL: 'https://quantora-coding-worker-pilot.vercel.app', QIR_BROWSER_PILOT_WORKER_TOKEN: 'synthetic-test-secret',
  QIR_WORKFLOW_PILOT_ENABLED: 'true', QIR_AI_GATEWAY_API_KEY: 'synthetic', QIR_WORKER_MODEL: 'test/model', QIR_GATEWAY_MODELS: 'test/model',
};
const vfs = { 'index.html': '<html>Saved</html>' };
const input = { userSub: 'pilot-user', sessionId: 'pilot-desk', runId: 'pilot-run', goal: 'Change the title', workspaceHash: hashVfsContent(vfs) };
const loaded = { status: 'loaded' as const, sessionId: input.sessionId, vfs, checkpointCount: 1 };
function configure(t: any) {
  const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
function capture() {
  return { code: 0, data: null as any, status(code: number) { this.code = code; return this; }, json(data: any) { this.data = data; return this; } };
}
const request = { method: 'POST', body: { ...input, action: 'coding.workflow_submit' } };
const record = (run = browserSubmissionRun(input)) => ({ run, storageVersion: 1, createdAt: run.createdAt, updatedAt: run.updatedAt });

test('scope validation requires every identity and an approved model', () => {
  assert.equal(validBrowserSubmission(input, env), true);
  assert.equal(isValidQirRunSnapshot(browserSubmissionRun(input)), true);
  for (const key of Object.keys(input)) assert.equal(validBrowserSubmission({ ...input, [key]: undefined } as any, env), false, key);
  assert.equal(validBrowserSubmission({ goal: input.goal, workspaceHash: input.workspaceHash } as any, {}), false);
  assert.equal(browserPilotAllows(input.userSub, input.sessionId, input.runId, env), true);
  for (const key of ['QIR_BROWSER_PILOT_ENABLED', 'QIR_AI_GATEWAY_API_KEY', 'QIR_WORKER_MODEL', 'QIR_GATEWAY_MODELS']) {
    assert.equal(browserPilotAllows(input.userSub, input.sessionId, input.runId, { ...env, [key]: '' }), false, key);
  }
});
test('authenticated account and desk are checked before reads or scheduling', async (t) => {
  configure(t);
  const ports: any = { read() { throw new Error('Read not allowed'); }, load() { throw new Error('Read not allowed'); }, fetch() { throw new Error('Start not allowed'); } };
  for (const [user, req] of [['another-user', request], [input.userSub, { ...request, body: { ...request.body, sessionId: 'another-desk' } }]] as const) {
    const res = capture();
    await handleBrowserPilotRequest(req, res, user, ports);
    assert.equal(res.code, 403);
  }
});
test('no schedule occurs against unsaved source; no redirect can receive the worker secret', async (t) => {
  configure(t);
  const res = capture();
  await handleBrowserPilotRequest(request, res, input.userSub, {
    read: async () => null, load: async () => ({ ...loaded, vfs: { 'index.html': 'Newer' } }), fetch: async () => { throw new Error('Must not schedule'); },
  });
  assert.equal(res.code, 409);
  process.env.QIR_BROWSER_PILOT_WORKER_URL = 'https://untrusted.invalid';
  const refused = capture();
  await handleBrowserPilotRequest(request, refused, input.userSub);
  assert.equal(refused.code, 403);
});
test('202 only follows durable admission; timeouts preserve identity for retry', async (t) => {
  configure(t);
  let calls = 0;
  const ports = { read: async () => null, load: async () => loaded, fetch: async (_url: any, options: any) => {
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), input);
    calls++;
    if (calls === 1) throw new Error('socket closed after possible acceptance');
    return new Response(JSON.stringify({ runId: input.runId, workflowRunId: 'wrun_test' }), { status: 202 });
  } };
  const first = capture(); await handleBrowserPilotRequest(request, first, input.userSub, ports);
  assert.equal(first.code, 503);
  assert.equal(first.data.reason, 'scheduling-unconfirmed');
  assert.ok(!JSON.stringify(first.data).includes(env.QIR_BROWSER_PILOT_WORKER_TOKEN));
  const retry = capture(); await handleBrowserPilotRequest(request, retry, input.userSub, ports);
  assert.equal(retry.code, 202); assert.equal(retry.data.durability, 'scheduled');
});
test('durable initialization is replayable; competing submissions cannot change the original', async (t) => {
  configure(t);
  let saved: ReturnType<typeof record> | null = null;
  let writes = 0;
  const ports = { read: async () => saved, load: async () => loaded, create: async (_user: string, run: any) => {
    writes++; saved ||= record(run); return { status: 'created' as const, record: saved };
  } };
  await initializeBrowserSubmission(input, ports);
  await initializeBrowserSubmission(input, ports);
  assert.equal(writes, 1);
  await assert.rejects(initializeBrowserSubmission({ ...input, goal: 'Other task' }, ports), /another submission/);
  assert.equal(writes, 1);
  // A lost race at the create RPC also checks the winning immutable submission.
  await assert.rejects(initializeBrowserSubmission({ ...input, goal: 'Other task' }, { ...ports, read: async () => null }), /Another submission/);
  assert.equal(saved!.run.goal.statement, input.goal);
});
test('workspace changes between acceptance and initialization produce a saved failure', async (t) => {
  configure(t);
  let saved: any;
  await initializeBrowserSubmission(input, { read: async () => null, load: async () => ({ ...loaded, vfs: { 'index.html': 'Newer' } }), create: async (_u, run) => {
    saved = run; return { status: 'created', record: record(run) };
  } });
  assert.equal(saved.status, 'FAILED_TERMINAL');
  assert.equal(isValidQirRunSnapshot(saved), true);
  assert.equal(saved.observations[0].error.retryable, false);
});
test('workspace changes after initialization stop before spending on the model or overwriting files', async () => {
  const run = browserSubmissionRun(input);
  const executor = createQirServerCodingExecutor({
    loadWorkspace: async () => ({ ...loaded, vfs: { 'index.html': 'Newer' } }),
    modelRunner: async () => { throw new Error('No model spend allowed'); },
    saveWorkspace: async () => { throw new Error('No writes allowed'); },
  });
  const result: any = await executor.execute(run, { stepId: 'browser-pilot', taskId: 'coding.model', actionId: 'browser-pilot-action' }, { userSub: input.userSub, runId: input.runId });
  assert.equal(result.observation.error.retryable, false);
  assert.equal(result.observation.evidence[0].kind, 'runtime.submission_workspace_changed');
});
