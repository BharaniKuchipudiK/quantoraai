import { createHash } from 'node:crypto';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';
import { QIR_CONTRACT_VERSION, type QirAgentRun } from '../../api/_lib/qir-contracts.js';
import { attachQirWorkingContext, compactQirWorkingContext } from '../../api/_lib/qir-context-state.js';
import { createQirRun, readQirRun } from '../../api/_lib/qir-run-store.js';
import { loadQirDeskWorkspace, saveQirDeskWorkspace } from '../../api/_lib/qir-desk-workspace.js';
import { readDeskCheckpoints, saveDeskCheckpointsRevision } from '../../api/_lib/store.js';
import { liveProofEnabled } from './live-proof.js';
import { pilotAllows } from './transition.js';

export const JOURNAL_PROOF_USER = 'qir-workflow-synthetic-20260912';
export const JOURNAL_PROOF_RUN = 'qir-workflow-journal-20260912';
export const JOURNAL_PROOF_SESSION = 'qir-workflow-desk-20260912';
export const quantityTests = `import assert from 'node:assert/strict';
import { clampQuantity } from './quantity.mjs';
for (let n=-100;n<=200;n++) assert.equal(clampQuantity(n),Math.max(0,Math.min(99,n)));
for (const [value,expected] of [[3.9,3],[NaN,0],[Infinity,0],['12',12],['bad',0]]) assert.equal(clampQuantity(value),expected);
console.log('306 quantity assertions passed');\n`;
export function journalProofRun(): QirAgentRun {
  const now = new Date().toISOString();
  const objective = 'Fix only quantity.mjs: clampQuantity must convert with Number, return 0 for non-finite input, otherwise floor and clamp to 0..99 inclusive. Preserve all other files and test/build scripts exactly.';
  const run: QirAgentRun = {
    version: QIR_CONTRACT_VERSION, runId: JOURNAL_PROOF_RUN,
    goal: { statement: objective, status: 'confirmed' }, status: 'EXECUTING',
    steps: [{ stepId: 'quantity-fix', taskId: 'coding.model', objective, dependsOn: [], status: 'active', requiresVerification: true, actionId: 'journal-quantity-fix' }],
    cursor: { stepId: 'quantity-fix', actionId: 'journal-quantity-fix', attempt: 0 },
    artifacts: [], observations: [], verifications: [], checkpoints: [],
    budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: now, updatedAt: now,
  };
  return attachQirWorkingContext(run, compactQirWorkingContext({ run, projectState: { sessionId: JOURNAL_PROOF_SESSION, executionOwner: 'server' } }));
}
export function journalProofAllowed() {
  return liveProofEnabled() && pilotAllows(JOURNAL_PROOF_USER, JOURNAL_PROOF_RUN);
}
export async function seedJournalProof() {
  if (!journalProofAllowed()) throw new Error('Journal proof is disabled.');
  const existing = await readQirRun(JOURNAL_PROOF_USER, JOURNAL_PROOF_RUN);
  if (existing) return { status: 'exists', runId: JOURNAL_PROOF_RUN };
  const run = journalProofRun();
  const vfs = {
    'package.json': JSON.stringify({ name: 'quantora-journal-proof', private: true, type: 'module', scripts: { test: 'node --test quantity.test.mjs', build: 'node --check quantity.mjs' } }),
    'quantity.mjs': 'export function clampQuantity(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 0; }\n',
    'quantity.test.mjs': quantityTests,
    'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quantity verification</title><style>body{margin:0;padding:3rem;font-family:system-ui;background:#eef2ff;color:#172554}main{max-width:48rem;margin:auto;padding:2rem;background:white;border-radius:1rem}h1{font-size:2rem}p{line-height:1.6}</style></head><body><main><h1>Quantity verification</h1><p>The quantity module is tested independently with Node assertions.</p><a href="https://example.com">Reference</a></main></body></html>',
  };
  const saved = await saveQirDeskWorkspace({ userSub: JOURNAL_PROOF_USER, run, vfs, checkpointId: 'journal-proof-baseline', label: 'Synthetic baseline: known 100-item defect' });
  if (saved.status !== 'saved') throw new Error('Synthetic baseline could not be saved.');
  const created = await createQirRun(JOURNAL_PROOF_USER, run);
  if (created.status !== 'created') throw new Error('Synthetic run could not be created.');
  return { status: 'created', runId: run.runId, storageVersion: created.record.storageVersion };
}
export async function readJournalProof() {
  if (!journalProofAllowed()) throw new Error('Journal proof is disabled.');
  const record = await readQirRun(JOURNAL_PROOF_USER, JOURNAL_PROOF_RUN);
  if (!record) return { status: 'missing' };
  const workspace = await loadQirDeskWorkspace(JOURNAL_PROOF_USER, record.run);
  return {
    status: record.run.status, storageVersion: record.storageVersion,
    observations: record.run.observations, verifications: record.run.verifications,
    artifacts: record.run.artifacts, checkpoints: record.run.checkpoints,
    workspace: workspace.status === 'loaded' ? {
      status: 'loaded', checkpointCount: workspace.checkpointCount,
      quantitySource: workspace.vfs['quantity.mjs'],
      testsUnchanged: workspace.vfs['quantity.test.mjs'] === quantityTests,
      quantityHash: createHash('sha256').update(workspace.vfs['quantity.mjs'] || '').digest('hex'),
    } : workspace,
  };
}
export async function proveSaveConflict() {
  if (!journalProofAllowed()) throw new Error('Journal proof is disabled.');
  const session = JOURNAL_PROOF_SESSION + '-save-conflict';
  const existing = await readDeskCheckpoints(JOURNAL_PROOF_USER, session);
  if (existing === null) throw new Error('Checkpoint store unavailable.');
  if (existing.length) return { status: 'already-run', generation: existing[0].generation };
  const rows = ['writer-a', 'writer-b'].map(id => [{ checkpoint_id: id, seq: 0, label: id, origin: 'commit', hash: hashVfsContent({ 'winner.txt': id }), delta: { changed: { 'winner.txt': id }, removed: [] } }]);
  const results = await Promise.all(rows.map(row => saveDeskCheckpointsRevision(JOURNAL_PROOF_USER, session, row, 0)));
  const winner = results.findIndex(result => result.status === 'saved');
  if (winner < 0 || results.filter(result => result.status === 'conflict').length !== 1) throw new Error('Concurrent save contract failed.');
  const stale = await saveDeskCheckpointsRevision(JOURNAL_PROOF_USER, session, rows[1-winner], 0);
  const stored = await readDeskCheckpoints(JOURNAL_PROOF_USER, session);
  if (stale.status !== 'conflict' || stored?.[0]?.checkpoint_id !== rows[winner][0].checkpoint_id) throw new Error('Stale save overwrote winning revision.');
  return { status: 'passed', concurrentResults: results.map(r => r.status), staleResult: stale.status, winningCheckpoint: stored[0].checkpoint_id, generation: stored[0].generation };
}
