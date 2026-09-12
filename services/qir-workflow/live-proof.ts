import { FatalError, RetryableError, getStepMetadata } from 'workflow';
import { createHash } from 'node:crypto';
import { createQirGatewayRunner } from '../../api/_lib/qir-gateway-model.js';
import { createRealSandbox } from '../../api/_lib/sandbox-factory.js';

export function liveProofEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.QIR_PILOT_LIVE_PROOF === 'true'
    && Boolean(env.QIR_PILOT_PROJECT_ID)
    && env.VERCEL_PROJECT_ID === env.QIR_PILOT_PROJECT_ID;
}
function requireProofProject() {
  if (!liveProofEnabled()) throw new FatalError('Live proof is not enabled for this project.');
}

/** Synthetic operator proof; no production database access or customer workspace. */
export async function liveRecoveryProof() {
  'use workflow';
  const candidate = await generateCandidate();
  const restart = await interruptWorkerOnce();
  const verification = await verifyCandidate(candidate.text);
  return { status: 'verified', modelId: candidate.modelId, usage: candidate.usage,
    providerFailure: 'injected-http-503', generationAttempts: candidate.attempts,
    restartAttempts: restart.attempts, ...verification };
}

async function generateCandidate() {
  'use step';
  requireProofProject();
  const { attempt } = getStepMetadata();
  const runner = attempt === 1 ? createQirGatewayRunner({
    generate: (async () => { throw { statusCode: 503 }; }) as any,
  }) : createQirGatewayRunner();
  const result = await runner({
    modelId: process.env.QIR_WORKER_MODEL || '',
    prompt: 'Return only JavaScript source, no markdown: export function clampQuantity(value). Convert value with Number, return 0 for non-finite numbers, otherwise floor and clamp to the inclusive range 0..99. No imports or side effects.',
  });
  if (result.status === 'failure') {
    if (result.failure.retryable) throw new RetryableError(`Proof provider step: ${result.failure.providerCode}`, { retryAfter: '2s' });
    throw new FatalError(`Proof provider refused: ${result.failure.providerCode}`);
  }
  return { text: result.text, modelId: result.modelId, usage: result.usage, attempts: attempt };
}
generateCandidate.maxRetries = 1;

async function interruptWorkerOnce() {
  'use step';
  requireProofProject();
  const { attempt } = getStepMetadata();
  if (attempt === 1) {
    console.log('QIR synthetic proof: intentionally terminating isolated worker after durable model result.');
    process.exit(17);
  }
  return { attempts: attempt };
}
interruptWorkerOnce.maxRetries = 1;

async function verifyCandidate(source: string) {
  'use step';
  requireProofProject();
  const sandbox = await createRealSandbox({ timeout: 60_000, resources: { vcpus: 2 } } as any);
  try {
    await sandbox.writeFiles([
      { path: 'quantity.mjs', content: Buffer.from(source) },
      { path: 'quantity.test.mjs', content: Buffer.from(`
import assert from 'node:assert/strict';
import {clampQuantity} from './quantity.mjs';
const cases = [[0,0],[1,1],[98,98],[99,99],[100,99],[1000000000,99],[-1,0],[3.9,3],[NaN,0],[Infinity,0],['12',12],['bad',0]];
for (const [input, expected] of cases) assert.equal(clampQuantity(input), expected);
for (let n=-100;n<=200;n++) assert.equal(clampQuantity(n),Math.max(0,Math.min(99,n)));
console.log('313 quantity assertions passed');
`) },
    ]);
    const result = await sandbox.runCommand({ cmd: 'node', args: ['--test', 'quantity.test.mjs'] });
    const output = await result.output('both');
    if (result.exitCode !== 0) throw new FatalError('Generated quantity code failed the independent Sandbox tests.');
    return { sourceHash: createHash('sha256').update(source).digest('hex'), assertions: 313, sandboxExitCode: result.exitCode, output: output.slice(-2000) };
  } finally {
    await sandbox.stop();
  }
}
verifyCandidate.maxRetries = 0;
