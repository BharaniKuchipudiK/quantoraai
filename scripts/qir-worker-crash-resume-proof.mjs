/*
 * PROOF: a QIR run driven by worker.ts survives a SIGKILL mid-step.
 *
 * This is the reproduce-then-fix evidence this repo's doctrine requires
 * before "the worker can resume after a crash" is a claim anyone can trust
 * (.quantorarules / custom instructions §2). It does not simulate a crash by
 * calling a function twice — it starts worker.ts as a REAL, separate OS
 * process, waits for it to durably commit at least one step, sends it a real
 * SIGKILL (the same signal an OOM killer or a host eviction sends), starts a
 * second real process pointed at the same durable file, and asserts:
 *
 *   1. Progress already committed before the kill is still there after it
 *      (the crash did not roll back or corrupt state already durable).
 *   2. The restarted worker resumes and drives the run further forward
 *      (a crash does not permanently wedge the run).
 *   3. No step is committed twice (the idempotent-eventId guard in
 *      qir-local-file-store.ts actually holds, not just in theory).
 *
 * Uses the Phase 1 local file store (api/_lib/qir-local-file-store.ts) —
 * explicitly NOT the production Supabase-backed store, which needs
 * credentials this environment does not have. See that file's own doc
 * comment for exactly what this substitutes for and what it does not.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const USER_SUB = 'proof-user';
const RUN_ID = 'proof-run-crash-resume-1';

const failures = [];
function check(condition, message) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
  if (!condition) failures.push(message);
}

const storeDir = mkdtempSync(join(tmpdir(), 'qir-worker-crash-proof-'));

/** Build a minimal, valid QirAgentRun with N sequential pending steps. */
function buildSeedRunSource(stepCount) {
  return `
    const steps = Array.from({ length: ${stepCount} }, (_, i) => ({
      stepId: 'step-' + i,
      taskId: 'task-' + i,
      objective: 'proof step ' + i,
      dependsOn: i === 0 ? [] : ['step-' + (i - 1)],
      status: 'pending',
      requiresVerification: false,
      actionId: null,
    }));
    const now = new Date().toISOString();
    /** @type {import('../api/_lib/qir-contracts.js').QirAgentRun} */
    const run = {
      version: QIR_CONTRACT_VERSION,
      runId: ${JSON.stringify(RUN_ID)},
      goal: { statement: 'crash/resume proof', status: 'confirmed' },
      status: 'EXECUTING',
      steps,
      cursor: { stepId: null, actionId: null, attempt: 0 },
      artifacts: [],
      observations: [],
      verifications: [],
      checkpoints: [],
      budget: { runUnitsRemaining: 100, stepUnitsRemaining: 100, recoveryReserveRemaining: 10, premiumEscalationRemaining: 10 },
      createdAt: now,
      updatedAt: now,
    };
  `;
}

async function seedRun(stepCount) {
  const seedScript = `
    import { QIR_CONTRACT_VERSION } from '${resolve(ROOT, 'api/_lib/qir-contracts.js')}';
    import { seedLocalFileQirRun } from '${resolve(ROOT, 'api/_lib/qir-local-file-store.js')}';
    ${buildSeedRunSource(stepCount)}
    seedLocalFileQirRun(${JSON.stringify(storeDir)}, ${JSON.stringify(USER_SUB)}, run);
    console.log('seeded');
  `;
  await runNodeInline(seedScript);
}

function runNodeInline(source) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(join(ROOT, 'node_modules', '.bin', 'tsx'), ['--eval', source], { cwd: ROOT, stdio: 'pipe' });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('exit', (code) => (code === 0 ? resolvePromise(out) : reject(new Error(`inline script failed (${code}):\n${err}`))));
  });
}

function readRawRecord() {
  // Import fresh each call (no module cache reuse across the crash) so this
  // reads whatever is actually on disk right now, the same way a second
  // real worker process would.
  return runNodeInline(`
    import { readLocalFileQirRunRaw } from '${resolve(ROOT, 'api/_lib/qir-local-file-store.js')}';
    const record = readLocalFileQirRunRaw(${JSON.stringify(storeDir)}, ${JSON.stringify(USER_SUB)}, ${JSON.stringify(RUN_ID)});
    console.log(JSON.stringify(record));
  `).then((out) => JSON.parse(out.trim().split('\n').pop()));
}

function startWorker(maxSteps, stepDelayMs) {
  // `detached: true` puts the spawned process in its own process group. tsx
  // itself execs the real worker rather than forking a separate child on
  // this platform/version, so a plain child.kill() is enough here — but the
  // detached group + killWorker() below (which signals the whole group) is
  // what makes this robust to either behavior, matching the same pattern
  // scripts/desktop-smoke-gate.mjs already relies on for the same reason.
  const child = spawn(join(ROOT, 'node_modules', '.bin', 'tsx'), ['worker.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      QIR_WORKER_STORE_DIR: storeDir,
      QIR_WORKER_USER_SUB: USER_SUB,
      QIR_WORKER_RUN_ID: RUN_ID,
      QIR_WORKER_MAX_STEPS: maxSteps ? String(maxSteps) : '',
      QIR_WORKER_STEP_DELAY_MS: stepDelayMs ? String(stepDelayMs) : '',
    },
    stdio: 'pipe',
    detached: true,
  });
  let log = '';
  child.stdout.on('data', (c) => { log += c; process.stdout.write(`  [worker pid=${child.pid}] ${c}`); });
  child.stderr.on('data', (c) => { log += c; process.stderr.write(`  [worker pid=${child.pid} stderr] ${c}`); });
  return { child, getLog: () => log };
}

/** SIGKILL the whole process group tsx started, not just the wrapper pid. */
function killWorker(worker) {
  try { process.kill(-worker.child.pid, 'SIGKILL'); } catch { /* already gone */ }
  try { worker.child.kill('SIGKILL'); } catch { /* already gone */ }
}

async function waitForAsync(predicate, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}


async function main() {
  console.log(`qir-worker-crash-resume-proof: store dir ${storeDir}`);
  const STEP_COUNT = 8;
  await seedRun(STEP_COUNT);

  const before = await readRawRecord();
  check(before && before.storageVersion === 1, 'seeded run starts at storage version 1');
  check(before && before.committedEventIds.length === 0, 'seeded run has committed zero events');

  // 1) Start worker A with a deliberate per-step delay — a real proof needs
  //    an actual window to send a real SIGKILL between two committed steps,
  //    rather than racing a heartbeat loop with no work to do. Let it durably
  //    commit at least one succeeded step but not all of them, then kill it.
  const workerA = startWorker(undefined, 400);
  await waitForAsync(
    async () => {
      const record = await readRawRecord();
      const succeeded = (record?.run.steps || []).filter((s) => s.status === 'succeeded').length;
      return succeeded >= 1 && succeeded < STEP_COUNT;
    },
    15_000,
    'worker A commits at least one succeeded step without finishing the whole run',
  );
  const afterFirstStep = await readRawRecord();
  const succeededBeforeKill = afterFirstStep.run.steps.filter((s) => s.status === 'succeeded').length;
  check(succeededBeforeKill >= 1 && succeededBeforeKill < STEP_COUNT, `some but not all steps succeeded before the kill (${succeededBeforeKill}/${STEP_COUNT})`);
  check(afterFirstStep.committedEventIds.length >= 2, `at least a claim and an observation were durably committed before the kill (got ${afterFirstStep.committedEventIds.length})`);

  killWorker(workerA);
  await waitForAsync(async () => workerA.child.exitCode !== null || workerA.child.signalCode !== null, 5_000, 'worker A process actually terminated');

  const afterKill = await readRawRecord();
  check(afterKill.storageVersion === afterFirstStep.storageVersion, 'the committed progress survives the SIGKILL untouched (no corruption, no rollback)');
  check(JSON.stringify(afterKill.run) === JSON.stringify(afterFirstStep.run), 'the run snapshot on disk is byte-identical before and after the kill');

  // 2) Start worker B against the SAME durable file, no delay this time. It
  //    must resume from where A left off, not restart from step 0 and not
  //    refuse to move.
  const workerB = startWorker(undefined, undefined);
  await waitForAsync(
    async () => /worker: loop ended/.test(workerB.getLog()),
    30_000,
    'worker B finishes driving the remaining steps',
  );

  const final = await readRawRecord();
  check(final.run.steps.every((s) => s.status === 'succeeded'), `every one of the ${STEP_COUNT} seeded steps ended succeeded (got: ${final.run.steps.map((s) => s.status).join(',')})`);
  check(new Set(final.committedEventIds).size === final.committedEventIds.length, 'every committed eventId is unique — no step (claim or observation) was ever double-applied');
  check(final.storageVersion === 1 + final.committedEventIds.length, 'the storage version advanced by exactly one for every durable event committed — no phantom or skipped commits');
  check(final.committedEventIds.length > afterFirstStep.committedEventIds.length, 'worker B durably committed further events beyond what worker A had committed before the kill');

  rmSync(storeDir, { recursive: true, force: true });

  if (failures.length) {
    console.error(`\nqir-worker-crash-resume-proof FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\nqir-worker-crash-resume-proof passed — a real SIGKILL mid-run loses no committed progress, and a second real process resumes it to completion with no duplicated steps.');
}

main().catch((error) => {
  console.error('qir-worker-crash-resume-proof: fatal', error);
  if (existsSync(storeDir)) rmSync(storeDir, { recursive: true, force: true });
  process.exit(1);
});
