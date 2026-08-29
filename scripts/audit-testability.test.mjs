import assert from 'node:assert/strict';
import test from 'node:test';
import { namedButBlocked, splitByGatewayReadiness } from './audit-testability.mjs';

const candidates = [
  { id: 'gemini-3.7-flash', gateway: 'google' },
  { id: 'openai/gpt-5.6-luna', gateway: 'openrouter' },
  { id: 'deepseek/deepseek-v4-flash-0731', gateway: 'openrouter' },
];

test('INVARIANT: a gateway with no proven credential contributes nothing to test', () => {
  // The exact shape of the trap: the OpenRouter catalogue lists anonymously,
  // so its models are collected even with no key. Calling one would send
  // `Bearer null` and record the 401 as a model failure.
  const { reachable, blocked } = splitByGatewayReadiness(candidates, { google: true, openrouter: false });
  assert.deepEqual(reachable.map((c) => c.id), ['gemini-3.7-flash']);
  assert.equal(blocked.length, 2);
});

test('readiness is never inferred — anything but an explicit true is blocked', () => {
  // A catalogue that answered is not a credential that works.
  for (const value of [undefined, null, false, 'yes', 1]) {
    const { reachable } = splitByGatewayReadiness(candidates, { google: value, openrouter: value });
    assert.equal(reachable.length, 0, `gatewayReady ${JSON.stringify(value)} must not authorise a call`);
  }
});

test('both gateways proven means everything is testable', () => {
  const { reachable, blocked } = splitByGatewayReadiness(candidates, { google: true, openrouter: true });
  assert.equal(reachable.length, 3);
  assert.equal(blocked.length, 0);
});

test('a model asked for by name and unreachable is named back, not dropped', () => {
  const { blocked } = splitByGatewayReadiness(candidates, { google: true, openrouter: false });
  assert.deepEqual(
    namedButBlocked(['openai/gpt-5.6-luna', 'gemini-3.7-flash'], blocked),
    ['openai/gpt-5.6-luna'],
  );
});

test('nothing to say when every named model is reachable', () => {
  const { blocked } = splitByGatewayReadiness(candidates, { google: true, openrouter: true });
  assert.deepEqual(namedButBlocked(['openai/gpt-5.6-luna'], blocked), []);
});

test('empty inputs are answers, not crashes', () => {
  assert.deepEqual(splitByGatewayReadiness([], {}), { reachable: [], blocked: [] });
  assert.deepEqual(splitByGatewayReadiness(undefined, undefined), { reachable: [], blocked: [] });
  assert.deepEqual(namedButBlocked(undefined, undefined), []);
});
