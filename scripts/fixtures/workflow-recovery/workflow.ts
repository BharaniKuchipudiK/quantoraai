import { sleep, RetryableError } from 'workflow';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { createQirGatewayRunner } from '../../../api/_lib/qir-gateway-model.js';

// Local fixture only: never part of the worker service or the main application.
export async function recoveryProof() {
  'use workflow';
  const text = await callProvider();
  await checkpoint(text);
  await sleep('8s');
  await finish();
  return { status: 'complete' };
}
async function callProvider() {
  'use step';
  const file = process.env.PROOF_LEDGER!;
  const old = await readFile(file, 'utf8').catch(() => '');
  await appendFile(file, 'provider-attempt\n');
  const result = await createQirGatewayRunner({
    env: { QIR_AI_GATEWAY_API_KEY: 'fixture-no-network', QIR_GATEWAY_MODELS: 'test/model' },
    generate: (async () => {
      if (!old.includes('provider-attempt')) throw { statusCode: 503 };
      return { text: 'saved output', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } };
    }) as any,
  })({ modelId: 'test/model', prompt: 'test' });
  if (result.status === 'failure') {
    if (result.failure.retryable) throw new RetryableError('Simulated provider outage', { retryAfter: '1s' });
    throw new Error('Unexpected permanent failure');
  }
  return result.text;
}
callProvider.maxRetries = 1;
async function checkpoint(text: string) {
  'use step';
  await writeFile(process.env.PROOF_CHECKPOINT!, text);
  await appendFile(process.env.PROOF_LEDGER!, 'checkpoint\n');
}
checkpoint.maxRetries = 0;
async function finish() {
  'use step';
  const text = await readFile(process.env.PROOF_CHECKPOINT!, 'utf8');
  if (text !== 'saved output') throw new Error('Checkpoint missing');
  await appendFile(process.env.PROOF_LEDGER!, 'finished\n');
}
finish.maxRetries = 0;
