import assert from 'node:assert/strict';
import test from 'node:test';
import { attachQirWorkingContext, compactQirWorkingContext } from './qir-context-state.js';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from './qir-contracts.js';
import { loadQirDeskWorkspace, saveQirDeskWorkspace } from './qir-desk-workspace.js';
import { planDeskCheckpointChain } from '../../src/lib/desk-checkpoint-delta.js';

function runWithSession(sessionId = 'chat-1'): QirAgentRun {
  const now = '2026-09-12T00:00:00.000Z';
  const base: QirAgentRun = {
    version: QIR_CONTRACT_VERSION,
    runId: 'run-1',
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
