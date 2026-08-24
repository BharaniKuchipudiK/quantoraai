import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canaryPromptsForModel,
  evaluateCanaryResults,
  isCodingModelId,
  CANARY_PROMPTS,
} from './model-canary-prompts.js';

test('isCodingModelId detects coder / code / nemotron slugs', () => {
  assert.equal(isCodingModelId('qwen/qwen-2.5-coder-32b-instruct'), true);
  assert.equal(isCodingModelId('nvidia/nemotron-3-super-120b-a12b:free'), true);
  assert.equal(isCodingModelId('deepseek/deepseek-chat'), false);
  assert.equal(isCodingModelId('google/gemini-2.5-flash'), false);
});

test('canaryPromptsForModel adds coding check only for coding models', () => {
  assert.deepEqual(canaryPromptsForModel('meta-llama/llama-3.3-70b-instruct').map((p) => p.id), ['ping']);
  assert.deepEqual(canaryPromptsForModel('qwen/qwen-2.5-coder-32b-instruct').map((p) => p.id), ['ping', 'coding']);
});

test('evaluateCanaryResults requires non-empty valid reply within latency budget', () => {
  const prompts = [CANARY_PROMPTS.ping];
  const pass = evaluateCanaryResults(prompts, [{ ok: true, text: 'PONG', latencyMs: 900 }]);
  assert.equal(pass[0].passed, true);

  const empty = evaluateCanaryResults(prompts, [{ ok: true, text: '   ', latencyMs: 900 }]);
  assert.equal(empty[0].passed, false);

  const slow = evaluateCanaryResults(prompts, [{ ok: true, text: 'PONG', latencyMs: 40_000 }]);
  assert.equal(slow[0].passed, false);
  assert.match(slow[0].error, /Latency/);
});

test('coding canary accepts a simple arrow function', () => {
  const prompts = [CANARY_PROMPTS.coding];
  const ok = evaluateCanaryResults(prompts, [{ ok: true, text: 'const add = (a, b) => a + b', latencyMs: 1200 }]);
  assert.equal(ok[0].passed, true);
  const bad = evaluateCanaryResults(prompts, [{ ok: true, text: 'hello world', latencyMs: 1200 }]);
  assert.equal(bad[0].passed, false);
});
