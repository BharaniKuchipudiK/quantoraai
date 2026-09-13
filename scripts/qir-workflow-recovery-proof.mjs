import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const dir = await mkdtemp(join(tmpdir(), 'qir-workflow-proof-'));
const port = 43871;
const base = `http://127.0.0.1:${port}`;
const ledger = join(dir, 'ledger');
let child;
let logs = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await fn().catch(() => false)) return;
    await pause(150);
  }
  throw new Error(`Timed out: ${label}`);
}
function start() {
  child = spawn(process.execPath, [resolve('scripts/fixtures/workflow-recovery/.output/server/index.mjs')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), WORKFLOW_TARGET_WORLD: 'local',
      WORKFLOW_LOCAL_BASE_URL: base, WORKFLOW_LOCAL_DATA_DIR: join(dir, 'world'),
      PROOF_LEDGER: ledger, PROOF_CHECKPOINT: join(dir, 'checkpoint') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', b => { logs += b; appendFileSync(join(dir, 'live.log'), b); });
  child.stderr.on('data', b => { logs += b; appendFileSync(join(dir, 'live.log'), b); });
}
async function stop(signal) {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill(signal); await exited;
  }
}
try {
  start();
  await until(async () => (await fetch(base, { signal: AbortSignal.timeout(2000) })).status < 600, 'server boot');
  const response = await fetch(`${base}/start`, { method: 'POST', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 202);
  const { runId } = await response.json();
  await until(async () => (await readFile(ledger, 'utf8')).includes('checkpoint'), 'provider recovery and checkpoint');
  await pause(500);
  await stop('SIGKILL');
  assert.equal(child.signalCode, 'SIGKILL');
  console.log('Forced SIGKILL after checkpoint; restarting from persisted Workflow journal.');
  start();
  await until(async () => (await (await fetch(`${base}/status/${runId}`, { signal: AbortSignal.timeout(2000) })).json()).status === 'completed', 'resumed workflow completion');
  const entries = (await readFile(ledger, 'utf8')).trim().split('\n');
  assert.deepEqual(entries, ['provider-attempt', 'provider-attempt', 'checkpoint', 'finished']);
  console.log('PASS: simulated 503 recovered; SIGKILL/restart completed; model result and checkpoint were not repeated. No external model calls.');
} finally {
  await stop('SIGTERM');
  await writeFile(join(dir, 'server.log'), logs);
  console.log(`Proof artifacts: ${dir}`);
}
