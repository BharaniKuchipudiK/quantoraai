import assert from 'node:assert/strict';
import test from 'node:test';
import { attachQirWorkingContext, compactQirWorkingContext } from './qir-context-state.js';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from './qir-contracts.js';
import { loadQirDeskWorkspace, loadQirCodingWorkspace, saveQirDeskWorkspace } from './qir-desk-workspace.js';
import { createQirServerCodingExecutor } from './qir-server-coding-executor.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';
import { planDeskCheckpointChain } from '../../src/lib/desk-checkpoint-delta.js';

function runWithSession(sessionId = 'chat-1', runId = 'run-1'): QirAgentRun {
  const now = '2026-09-12T00:00:00.000Z';
  const base: QirAgentRun = {
    version: QIR_CONTRACT_VERSION,
    runId,
    goal: { statement: 'Change the app', status: 'confirmed' },
    status: 'EXECUTING',
    steps: [{
      stepId: 'step-1', taskId: 'coding.model', objective: 'Change the app', dependsOn: [],
      status: 'active', requiresVerification: true, actionId: 'action-1',
    }],
    cursor: { stepId: 'step-1', actionId: 'action-1', attempt: 0 },
    artifacts: [], observations: [], verifications: [], checkpoints: [],
    budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: now, updatedAt: now,
  };
  const context = compactQirWorkingContext({
    run: base,
    projectState: { sessionId, files: ['App.jsx'] },
    compactedAt: now,
  });
  return attachQirWorkingContext(base, context);
}

function rowsFor(vfs: Record<string, string>) {
  const plan = planDeskCheckpointChain([{ id: 'cp-1', at: 1, label: 'Initial', origin: 'commit', vfs, hash: '' }]);
  return plan.steps.map((step: any, seq: number) => ({
    checkpoint_id: step.id, seq, label: step.label, origin: step.origin, hash: step.hash, delta: step.delta,
  }));
}

test('a failed candidate stays out of the visible desk and survives for worker replay', async () => {
  const baseline = { 'index.html': '<main>Old</main>' };
  const chains = new Map<string, any[]>([['chat-1', rowsFor(baseline)]]);
  const bindings = {
    readRows: async (_sub: string, session: string) => chains.get(session) || [],
    saveRows: async (_sub: string, session: string, rows: any[]) => { chains.set(session, rows); return true; },
  };
  let models = 0;
  let pass = false;
  const executor = createQirServerCodingExecutor({
    loadWorkspace: (sub, run) => loadQirCodingWorkspace(sub, run, bindings),
    saveWorkspace: input => saveQirDeskWorkspace(input, bindings),
    modelRunner: async () => {
      models += 1;
      return { status: 'success', provider: 'openrouter', modelId: 'fixture',
        text: '```html filepath="index.html"\n<!doctype html><html><body><main>New</main></body></html>\n```' };
    },
    runtimeVerify: async () => ({ status: 'skipped', commands: [], reason: 'fixture' }),
    verify: async () => ({ score: pass ? 100 : 0, passed: pass, checks: [], issues: [], summary: 'fixture', critiqued: false }),
  });
  const run = runWithSession();
  const continuation = { stepId: 'step-1', taskId: 'coding.model', actionId: 'action-1' };
  const first: any = await executor.execute(run, continuation, { userSub: 'u1', runId: run.runId });
  assert.equal(first.eventType, 'worker.verification_failed', JSON.stringify(first));
  const visible = await loadQirDeskWorkspace('u1', run, bindings);
  assert.equal(visible.status, 'loaded');
  if (visible.status === 'loaded') assert.deepEqual(visible.vfs, baseline);
  const staged = await loadQirCodingWorkspace('u1', run, bindings);
  assert.equal(staged.status, 'loaded');
  if (staged.status === 'loaded') {
    assert.match(staged.vfs['index.html'], /New/);
    assert.deepEqual(staged.baselineVfs, baseline);
    assert.equal(staged.candidateCheckpointId, 'qir-action-1');
    assert.equal(staged.candidateBaselineHash, hashVfsContent(baseline));
  }
  // Lost event commit after staging: another worker replays the same action.
  pass = true;
  chains.set('chat-1', rowsFor({ 'index.html': '<main>User edit during restart</main>' }));
  const conflict: any = await executor.execute(run, continuation, { userSub: 'u1', runId: run.runId });
  assert.equal(conflict.observation.evidence[0].kind, 'runtime.workspace_publish_failed');
  assert.match(conflict.observation.error.message, /workspace-changed-during-verification/);
  const preserved = await loadQirDeskWorkspace('u1', run, bindings);
  if (preserved.status !== 'loaded') assert.fail('desk unavailable');
  assert.match(preserved.vfs['index.html'], /User edit during restart/);
  chains.set('chat-1', rowsFor(baseline));
  const replay: any = await executor.execute(run, continuation, { userSub: 'u1', runId: run.runId });
  assert.equal(models, 1, 'durable candidate must be reused before asking a model again');
  assert.equal(replay.eventType, 'worker.coding_completed');
  assert.equal(replay.payload.workspaceReplay, true);
  assert.equal(replay.committedRun.artifacts[0].ref, 'desk-checkpoint://chat-1/qir-action-1');
  const published = await loadQirDeskWorkspace('u1', run, bindings);
  if (published.status !== 'loaded') assert.fail('published workspace unavailable');
  assert.match(published.vfs['index.html'], /New/);
  // A crash after publication must not claim completion over a later user edit.
  await saveQirDeskWorkspace({ userSub: 'u1', run, checkpointId: 'user-edit',
    vfs: { 'index.html': '<main>Later user edit</main>' } }, bindings);
  const staleReplay: any = await executor.execute(run, continuation, { userSub: 'u1', runId: run.runId });
  assert.equal(staleReplay.observation.evidence[0].kind, 'runtime.workspace_publish_failed');
  assert.match(staleReplay.observation.error.message, /workspace-changed-after-publication/);
  assert.equal(staleReplay.committedRun, undefined);
  assert.equal(models, 1);
  // Another Run in the same desk cannot inherit this Run's failed candidates.
  const next = await loadQirCodingWorkspace('u1', runWithSession('chat-1', 'other-run'), bindings);
  if (next.status !== 'loaded') assert.fail('next workspace unavailable');
  assert.equal(next.candidateCheckpointId, undefined);
});

test('publishing refuses a desk that changed while verification was running', async () => {
  let writes = 0;
  const result = await saveQirDeskWorkspace({
    userSub: 'u1', run: runWithSession(), checkpointId: 'new',
    vfs: { 'index.html': '<main>Model</main>' },
    expectedWorkspaceHash: hashVfsContent({ 'index.html': '<main>Old</main>' }),
  }, {
    readRows: async () => rowsFor({ 'index.html': '<main>User edit</main>' }),
    saveRows: async () => { writes += 1; return true; },
  });
  assert.deepEqual(result, { status: 'unavailable', reason: 'workspace-changed-during-verification' });
  assert.equal(writes, 0);
});

test('server worker loads verified source from the durable desk checkpoint chain', async () => {
  const result = await loadQirDeskWorkspace('u1', runWithSession(), {
    readRows: async (userSub, sessionId) => {
      assert.equal(userSub, 'u1');
      assert.equal(sessionId, 'chat-1');
      return rowsFor({ 'App.jsx': 'export default function App(){ return <main>hello</main> }' });
    },
    saveRows: async () => true,
  });
  assert.equal(result.status, 'loaded');
  if (result.status !== 'loaded') return;
  assert.match(result.vfs['App.jsx'], /hello/);
  assert.equal(result.checkpointCount, 1);
});

test('server worker appends a replacement workspace as a new durable generation', async () => {
  let savedRows: any[] = [];
  const result = await saveQirDeskWorkspace({
    userSub: 'u1',
    run: runWithSession(),
    vfs: { 'App.jsx': 'export default function App(){ return <main>server-owned</main> }' },
  }, {
    readRows: async () => rowsFor({ 'App.jsx': 'export default function App(){ return <main>old</main> }' }),
    saveRows: async (_userSub, _sessionId, rows) => { savedRows = rows; return true; },
  });
  assert.equal(result.status, 'saved');
  assert.equal(savedRows.length, 2);
  assert.equal(savedRows[0].seq, 0);
  assert.equal(savedRows[1].seq, 1);
  assert.match(JSON.stringify(savedRows[1].delta), /server-owned/);
});

test('crash replay with the same action checkpoint does not perform the workspace mutation twice', async () => {
  let rows: any[] = rowsFor({ 'App.jsx': 'export default function App(){ return <main>old</main> }' });
  let writes = 0;
  const bindings = {
    readRows: async () => rows,
    saveRows: async (_userSub: string, _sessionId: string, next: any[]) => {
      writes += 1;
      rows = next;
      return true;
    },
  };
  const input = {
    userSub: 'u1',
    run: runWithSession(),
    checkpointId: 'qir-action-1',
    vfs: { 'App.jsx': 'export default function App(){ return <main>once</main> }' },
  };
  const first = await saveQirDeskWorkspace(input, bindings);
  assert.equal(first.status, 'saved');
  assert.equal(writes, 1);

  // Simulates process death after the external workspace save but before the
  // Run event commit. The replacement worker replays the same action id.
  const replay = await saveQirDeskWorkspace(input, bindings);
  assert.equal(replay.status, 'saved');
  if (replay.status === 'saved') assert.equal(replay.replayed, true);
  assert.equal(writes, 1, 'the durable workspace mutation must not run twice');
});

test('an idempotency key cannot be reused for different workspace bytes', async () => {
  let rows: any[] = rowsFor({ 'App.jsx': 'export default function App(){ return <main>old</main> }' });
  const bindings = {
    readRows: async () => rows,
    saveRows: async (_userSub: string, _sessionId: string, next: any[]) => { rows = next; return true; },
  };
  const run = runWithSession();
  await saveQirDeskWorkspace({
    userSub: 'u1', run, checkpointId: 'qir-action-1',
    vfs: { 'App.jsx': 'export default function App(){ return <main>first</main> }' },
  }, bindings);
  const conflicting = await saveQirDeskWorkspace({
    userSub: 'u1', run, checkpointId: 'qir-action-1',
    vfs: { 'App.jsx': 'export default function App(){ return <main>different</main> }' },
  }, bindings);
  assert.deepEqual(conflicting, { status: 'unavailable', reason: 'idempotency-key-reused-for-different-workspace' });
});

test('worker refuses to guess a desk session when the Run has no binding', async () => {
  const run = runWithSession('');
  const result = await loadQirDeskWorkspace('u1', run, {
    readRows: async () => { throw new Error('must not read'); },
    saveRows: async () => true,
  });
  assert.equal(result.status, 'missing-session-binding');
});

test('a browser save between worker read and write defeats worker publication atomically', async () => {
  const baseline = { 'index.html': 'baseline' };
  let current = rowsFor(baseline).map(row => ({ ...row, generation: 10 }));
  const result = await saveQirDeskWorkspace({ userSub: 'u1', run: runWithSession(),
    vfs: { 'index.html': 'worker' }, expectedWorkspaceHash: hashVfsContent(baseline) }, {
    readRows: async () => structuredClone(current),
    saveRows: async (_sub, _session, _rows, expectedRevision) => {
      current = rowsFor({ 'index.html': 'new browser work' }).map(row => ({ ...row, generation: 11 }));
      assert.equal(expectedRevision, 10);
      return expectedRevision === current[0].generation;
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(current[0].delta.changed['index.html'], 'new browser work');
});
