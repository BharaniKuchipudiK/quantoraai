import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSmokeResults, SMOKE_PROMPTS } from './model-smoke-test-prompts.js';

test('evaluateSmokeResults marks all prompts passed when responses qualify', () => {
  const raw = [
    { ok: true, text: 'OK', latencyMs: 400 },
    { ok: true, text: '42', latencyMs: 520 },
    { ok: true, text: 'Quantora helps builders turn ideas into working websites and apps quickly.', latencyMs: 880 },
  ];
  const results = evaluateSmokeResults(SMOKE_PROMPTS, raw);
  assert.equal(results.length, 3);
  assert.ok(results.every((item) => item.passed));
});

test('evaluateSmokeResults fails when math response is wrong', () => {
  const raw = [
    { ok: true, text: 'OK', latencyMs: 400 },
    { ok: true, text: '41', latencyMs: 520 },
    { ok: true, text: 'Quantora helps builders turn ideas into working websites and apps quickly.', latencyMs: 880 },
  ];
  const results = evaluateSmokeResults(SMOKE_PROMPTS, raw);
  assert.equal(results.find((item) => item.id === 'math')?.passed, false);
});
