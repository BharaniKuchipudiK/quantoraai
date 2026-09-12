import assert from 'node:assert/strict';
import test from 'node:test';
import { createQirGatewayRunner } from './qir-gateway-model.js';

const env = { QIR_AI_GATEWAY_API_KEY: 'test-key', QIR_GATEWAY_MODELS: 'test/model' };
const input = { modelId: 'test/model', prompt: 'Return a small file.' };
function runner(generate: (input: any) => Promise<any>, config = env) {
  return createQirGatewayRunner({ env: config, generate: generate as any });
}
const success = () => ({ text: 'file contents', finishReason: 'stop', usage: { inputTokens: 8, outputTokens: 4 }, providerMetadata: { gateway: { cost: 0.001 } } });

test('requires a dedicated credential and model allowlist before spending', async () => {
  let calls = 0;
  const generate = async () => { calls++; return success(); };
  for (const config of [{ ...env, QIR_AI_GATEWAY_API_KEY: '' }, { ...env, QIR_GATEWAY_MODELS: '' }]) {
    assert.equal((await runner(generate, config)(input)).status, 'failure');
  }
  assert.equal((await runner(generate)({ ...input, prompt: 'x'.repeat(80_001) })).status, 'failure');
  assert.equal(calls, 0);
});

test('bounds tokens, disables SDK retries, and records reported cost', async () => {
  const result = await runner(async request => {
    assert.equal(request.maxOutputTokens, 4096);
    assert.equal(request.maxRetries, 0);
    assert.ok(request.abortSignal);
    return success();
  })(input);
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.usage, { inputTokens: 8, outputTokens: 4, costUsd: 0.001 });
});

test('wrapped Gateway budget refusal never becomes a retry or leaks secrets', async () => {
  let calls = 0;
  const result = await runner(async () => {
    calls++;
    throw Object.assign(new Error('outer'), { statusCode: 500, cause: { statusCode: 402, message: 'quota_for_entity_exceeded secret-key request-body' } });
  })(input);
  assert.equal(calls, 1);
  assert.equal(result.status, 'failure');
  if (result.status === 'failure') {
    assert.equal(result.failure.httpStatus, 402);
    assert.equal(result.failure.retryable, false);
    assert.equal(result.failure.providerCode, 'budget_exceeded');
    assert.doesNotMatch(JSON.stringify(result), /secret-key|request-body/);
  }
});

test('transient provider failures are returned to the durable recovery owner', async () => {
  for (const statusCode of [429, 503]) {
    let calls = 0;
    const result = await runner(async () => { calls++; throw { statusCode }; })(input);
    assert.equal(calls, 1);
    assert.equal(result.status, 'failure');
    if (result.status === 'failure') assert.equal(result.failure.retryable, true);
  }
  for (const statusCode of [400, 401, 403]) {
    const result = await runner(async () => { throw { statusCode }; })(input);
    if (result.status === 'failure') assert.equal(result.failure.retryable, false);
    else assert.fail('must fail');
  }
});

test('rejects truncated and empty responses, and does not invent unreported cost', async () => {
  for (const response of [{ ...success(), finishReason: 'length' }, { ...success(), text: '' }]) {
    assert.equal((await runner(async () => response)(input)).status, 'failure');
  }
  const result = await runner(async () => ({ ...success(), providerMetadata: {} }))(input);
  if (result.status === 'success') assert.equal(result.usage?.costUsd, null);
  else assert.fail('expected success');
});

test('ownership cancellation prevents calls and discards late success', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runner(async () => { assert.fail('must not call'); })({ ...input, signal: controller.signal });
  if (result.status === 'failure') assert.equal(result.failure.providerCode, 'ownership_lost');
  const late = new AbortController();
  const second = await runner(async () => { late.abort(); return success(); })({ ...input, signal: late.signal });
  assert.equal(second.status, 'failure');
});


test('circular provider error data cannot break failure classification', async () => {
  const data: any = {}; data.self = data;
  const result = await runner(async () => { throw { statusCode: 503, data }; })(input);
  assert.equal(result.status, 'failure');
  if (result.status === 'failure') assert.equal(result.failure.retryable, true);
});
